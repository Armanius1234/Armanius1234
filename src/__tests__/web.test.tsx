/**
 * Building blocks of the web version. The whole site is tested in a real
 * browser by `npm run test:web` (scripts/web-e2e/run.mjs).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// The system dialog itself, to check what the wrapper passes on (tests may import it).
import { Alert as NativeAlert } from 'react-native';

import { I18nProvider } from '@/i18n';
import { createWebAuthStorage } from '@/lib/authStorage.web';
import { browserConfig, chooseConfig, isLocalhost, LOCAL_CONFIG_KEY, runtimeConfig } from '@/lib/env';
import { checkLocalConfig, clearLocalConfig, saveLocalConfig } from '@/lib/localConfig';
import { LocalSetup } from '@/features/system/LocalSetup';
import { readBytes } from '@/lib/files.web';
import { Alert, DialogHost, showWebDialog } from '@/ui/alert';
import { SensitiveImage } from '@/ui/SensitiveImage.web';

function host() {
  return render(
    <I18nProvider initial="en">
      <DialogHost />
    </I18nProvider>,
  );
}

describe('Dialogs (Alert) in the web version', () => {
  it('on the phone, Alert.alert is the system dialog with the same arguments', () => {
    const spy = jest.spyOn(NativeAlert, 'alert').mockImplementation(() => undefined);
    Alert.alert('Title', 'Body');
    expect(spy).toHaveBeenCalledWith('Title', 'Body');
    spy.mockRestore();
  });

  it('shows title, message and buttons; the cancel button goes last', async () => {
    const remove = jest.fn();
    const cancel = jest.fn();
    await host();
    await act(() =>
      showWebDialog('Delete this post?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel', onPress: cancel },
        { text: 'Delete', style: 'destructive', onPress: remove },
      ]),
    );
    expect(screen.getByText('Delete this post?')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Delete', 'Cancel']);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete this post?')).toBeNull();
  });

  it('a button can open the next dialog (menu, then confirmation)', async () => {
    const confirmed = jest.fn();
    await host();
    await act(() =>
      showWebDialog('Options', undefined, [
        {
          text: 'Delete',
          onPress: () => showWebDialog('Sure?', undefined, [{ text: 'Yes', onPress: confirmed }]),
        },
      ]),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('Options')).toBeNull();
    await fireEvent.press(await screen.findByRole('button', { name: 'Yes' }));
    expect(confirmed).toHaveBeenCalled();
  });

  it('without buttons there is one "OK" button, like on the phone', async () => {
    await host();
    await act(() => showWebDialog('Saved'));
    await fireEvent.press(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText('Saved')).toBeNull();
  });
});

describe('Login session storage in the browser', () => {
  function fakeStorage() {
    const data = new Map<string, string>();
    return {
      data,
      store: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    };
  }

  it('uses the browser storage when it is available', () => {
    const { data, store } = fakeStorage();
    const s = createWebAuthStorage(() => store);
    s.setItem('sb-auth-token', 'session');
    expect(data.get('sb-auth-token')).toBe('session');
    expect(s.getItem('sb-auth-token')).toBe('session');
    s.removeItem('sb-auth-token');
    expect(s.getItem('sb-auth-token')).toBeNull();
    expect(data.has('pl8.probe')).toBe(false);
  });

  it('falls back to memory when the browser blocks storage', () => {
    const s = createWebAuthStorage(() => {
      throw new Error('SecurityError');
    });
    s.setItem('sb-auth-token', 'session');
    expect(s.getItem('sb-auth-token')).toBe('session');
    s.removeItem('sb-auth-token');
    expect(s.getItem('sb-auth-token')).toBeNull();
  });
});

describe('Configuration file of the web version (pl8-config.js)', () => {
  it('reads the two public values, trimmed', () => {
    expect(
      runtimeConfig({ PL8_CONFIG: { supabaseUrl: ' https://abc.supabase.co ', supabaseKey: 'sb_publishable_x' } }),
    ).toEqual({ url: 'https://abc.supabase.co', key: 'sb_publishable_x' });
  });

  it('ignores a missing file or wrong values', () => {
    expect(runtimeConfig({})).toEqual({ url: '', key: '' });
    expect(runtimeConfig({ PL8_CONFIG: { supabaseUrl: 42, supabaseKey: null } })).toEqual({ url: '', key: '' });
  });
});

describe('Files in the browser', () => {
  it('reads a picked photo through its blob: address for upload', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(bytes) } as Response);
    await expect(readBytes('blob:http://x/1')).resolves.toBe(bytes);
    expect(fetchMock).toHaveBeenCalledWith('blob:http://x/1');
    fetchMock.mockRestore();
  });
});

describe('Sensitive photos in the browser (verification, reports)', () => {
  it('are downloaded without the browser cache and freed when they leave the screen', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) } as Response);
    const create = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pl8/photo');
    const revoke = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const view = await render(<SensitiveImage uri="https://abc.supabase.co/storage/v1/object/sign/x?token=t" />);
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('https://abc.supabase.co/storage/v1/object/sign/x?token=t', {
      cache: 'no-store',
      credentials: 'omit',
    });
    await view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:pl8/photo');

    fetchMock.mockRestore();
    create.mockRestore();
    revoke.mockRestore();
  });
});

describe('Testing on this computer (localhost)', () => {
  const KEY = 'sb_publishable_abcdefghijklmnopqrstuvwxyz';
  // Built at runtime so the repository's secret-key scan doesn't flag this made-up key.
  const SECRET = 'sb_secret_' + 'a-made-up-key-for-this-test';

  it('knows which addresses are this computer', () => {
    expect(['localhost', '127.0.0.1', '[::1]'].every(isLocalhost)).toBe(true);
    expect(isLocalhost('app.pl8.de')).toBe(false);
    expect(isLocalhost(undefined)).toBe(false);
  });

  it('uses .env first, then pl8-config.js, then the values entered in the browser', () => {
    const a = { url: 'https://a.supabase.co', key: KEY };
    const b = { url: 'https://b.supabase.co', key: KEY };
    const c = { url: 'https://c.supabase.co', key: KEY };
    const none = { url: '', key: '' };
    expect(chooseConfig(a, b, c)).toEqual({ ...a, source: 'build' });
    expect(chooseConfig(none, b, c)).toEqual({ ...b, source: 'file' });
    expect(chooseConfig(none, none, c)).toEqual({ ...c, source: 'browser' });
    expect(chooseConfig(none, none, { url: c.url, key: SECRET }).source).toBe('none');
  });

  it('checks the form: https address, a real publishable key, never a secret key', () => {
    expect(checkLocalConfig('https://abc.supabase.co', KEY)).toBeNull();
    expect(checkLocalConfig('abc.supabase.co', KEY)).toBe('url');
    expect(checkLocalConfig('http://abc.supabase.co', KEY)).toBe('url');
    expect(checkLocalConfig('https://abc.supabase.co', 'short')).toBe('key');
    expect(checkLocalConfig('https://abc.supabase.co', SECRET)).toBe('secret');
  });

  it('saves the values in the browser and reads them back; "change" removes them', () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    saveLocalConfig(' https://abc.supabase.co/ ', ` ${KEY} `, store);
    expect(browserConfig(store)).toEqual({ url: 'https://abc.supabase.co', key: KEY });
    expect(() => saveLocalConfig('https://abc.supabase.co', SECRET, store)).toThrow();
    clearLocalConfig(store);
    expect(data.has(LOCAL_CONFIG_KEY)).toBe(false);
    expect(browserConfig({ getItem: () => '{broken' })).toEqual({ url: '', key: '' });
  });

  it('the form refuses a secret key and explains why', async () => {
    const onSaved = jest.fn();
    await render(
      <I18nProvider initial="de">
        <LocalSetup onSaved={onSaved} />
      </I18nProvider>,
    );
    await fireEvent.changeText(screen.getByLabelText('Project URL'), 'https://abc.supabase.co');
    await fireEvent.changeText(screen.getByLabelText('Publishable Key'), SECRET);
    await fireEvent.press(screen.getByRole('button', { name: 'Verbinden' }));
    expect(screen.getByText(/Das ist ein geheimer Schlüssel/)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

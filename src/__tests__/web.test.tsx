/**
 * Building blocks of the web version. The whole site is tested in a real
 * browser by `npm run test:web` (scripts/web-e2e/run.mjs).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line no-restricted-imports -- checking what the wrapper passes on
import { Alert as NativeAlert } from 'react-native';

import { I18nProvider } from '@/i18n';
import { createWebAuthStorage } from '@/lib/authStorage.web';
import { runtimeConfig } from '@/lib/env';
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

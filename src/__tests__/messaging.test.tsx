import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import MessagesScreen from '@/app/(tabs)/messages';
import ChatScreen from '@/app/chat/[id]';
import { AuthContext } from '@/features/auth/AuthProvider';
import { MessageButton } from '@/features/messaging/MessageButton';
import { I18nProvider } from '@/i18n';
import type { ConversationInfo, InboxItem, Message } from '@/lib/database.types';

// ------------------------------------------------------------------ mocks ---
let mockRpcResults: Record<string, unknown> = {};
let mockMessageRows: Message[] = [];
const mockRpc = jest.fn((fn: string, _args?: unknown) => {
  const r = mockRpcResults[fn];
  if (r instanceof Error) return Promise.resolve({ data: null, error: { message: r.message, code: 'P0001' } });
  return Promise.resolve({ data: r ?? null, error: null });
});

jest.mock('@/lib/supabase', () => {
  const query = () => {
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      lt: () => q,
      limit: () => Promise.resolve({ data: mockMessageRows, error: null }),
    };
    return q;
  };
  return {
    supabase: {
      rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
      from: () => query(),
      storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
      auth: {},
    },
    avatarUrl: () => null,
  };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
  useLocalSearchParams: () => ({ id: 'c1' }),
}));

const auth = {
  session: { user: { id: 'me' } } as never,
  initializing: false,
  resetting: false,
  signIn: jest.fn(),
  signUp: jest.fn(),
  verifyEmail: jest.fn(),
  resendConfirmation: jest.fn(),
  requestPasswordReset: jest.fn(),
  completePasswordReset: jest.fn(),
  signOut: jest.fn(),
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider initial="en">
        <AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

function inboxItem(over: Partial<InboxItem>): InboxItem {
  return {
    conversation_id: 'c1',
    status: 'active',
    is_request_for_me: false,
    other_id: 'u1',
    other_username: 'leo_amg',
    other_display_name: 'Leo',
    other_avatar_path: null,
    last_message: 'See you at the meet',
    last_message_mine: false,
    last_message_at: minutesAgo(3),
    unread_count: 0,
    ...over,
  };
}

function info(over: Partial<ConversationInfo>): ConversationInfo {
  return {
    conversation_id: 'c1',
    status: 'active',
    is_request_for_me: false,
    i_sent_request: false,
    other_id: 'u1',
    other_username: 'leo_amg',
    other_display_name: 'Leo',
    other_avatar_path: null,
    other_last_read_at: minutesAgo(60),
    ...over,
  };
}

function msg(id: string, sender: string, body: string, ago: number): Message {
  return { id, conversation_id: 'c1', sender_id: sender, body, created_at: minutesAgo(ago) };
}

beforeEach(() => {
  mockRpcResults = {};
  mockMessageRows = [];
  mockRpc.mockClear();
  mockPush.mockClear();
});

// ------------------------------------------------------------------ inbox ---
describe('Messages tab', () => {
  it('separates chats from requests and shows unread counts', async () => {
    mockRpcResults.my_conversations = [
      inboxItem({ conversation_id: 'c1', unread_count: 2 }),
      inboxItem({ conversation_id: 'c2', other_display_name: 'Mia', last_message: 'Nice car', last_message_mine: true }),
      inboxItem({ conversation_id: 'c3', status: 'request', is_request_for_me: true, other_display_name: 'Max', last_message: 'Selling wheels' }),
    ];
    await wrap(<MessagesScreen />);
    expect(await screen.findByText('See you at the meet')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('You: Nice car')).toBeTruthy();
    expect(screen.queryByText('Selling wheels')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: 'Requests (1)' }));
    expect(screen.getByText('Selling wheels')).toBeTruthy();
    expect(screen.queryByText('See you at the meet')).toBeNull();
  });

  it('shows a pending note for requests you sent', async () => {
    mockRpcResults.my_conversations = [inboxItem({ status: 'request', last_message_mine: true })];
    await wrap(<MessagesScreen />);
    expect(await screen.findByText('Request sent. You can send more once Leo accepts.')).toBeTruthy();
  });

  it('has an empty state', async () => {
    mockRpcResults.my_conversations = [];
    await wrap(<MessagesScreen />);
    expect(await screen.findByText('No conversations yet')).toBeTruthy();
  });
});

// ------------------------------------------------------------------- chat ---
describe('Chat screen', () => {
  it('sends a trimmed message', async () => {
    mockRpcResults.conversation_info = [info({})];
    mockMessageRows = [msg('m1', 'u1', 'Hey!', 5)];
    await wrap(<ChatScreen />);
    expect(await screen.findByText('Hey!')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Message…'), '  On my way  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('send_message', { p_conversation: 'c1', p_body: 'On my way' }),
    );
  });

  it('marks the conversation as read when opened', async () => {
    mockRpcResults.conversation_info = [info({})];
    mockMessageRows = [msg('m1', 'u1', 'Hey!', 5)];
    await wrap(<ChatScreen />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('mark_conversation_read', { p_conversation: 'c1' }));
  });

  it('shows "Seen" when the other person has read your last message', async () => {
    mockRpcResults.conversation_info = [info({ other_last_read_at: minutesAgo(1) })];
    mockMessageRows = [msg('m2', 'me', 'Thanks', 2), msg('m1', 'u1', 'Hey!', 5)];
    await wrap(<ChatScreen />);
    expect(await screen.findByText(/Seen/)).toBeTruthy();
  });

  it('lets the recipient of a request accept it, without a text field', async () => {
    mockRpcResults.conversation_info = [info({ status: 'request', is_request_for_me: true })];
    mockMessageRows = [msg('m1', 'u1', 'Selling wheels', 5)];
    await wrap(<ChatScreen />);
    expect(await screen.findByText('Leo wants to message you')).toBeTruthy();
    expect(screen.queryByLabelText('Message…')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('respond_message_request', { p_conversation: 'c1', p_accept: true }),
    );
  });

  it('stops the sender after one message until the request is accepted', async () => {
    mockRpcResults.conversation_info = [info({ status: 'request', i_sent_request: true })];
    mockMessageRows = [msg('m1', 'me', 'Hi!', 1)];
    await wrap(<ChatScreen />);
    expect(await screen.findByText('Request sent. You can send more once Leo accepts.')).toBeTruthy();
    expect(screen.queryByLabelText('Message…')).toBeNull();
  });

  it('hides the text field in a closed conversation', async () => {
    mockRpcResults.conversation_info = [info({ status: 'declined' })];
    await wrap(<ChatScreen />);
    expect(await screen.findByText('This conversation was closed.')).toBeTruthy();
    expect(screen.queryByLabelText('Message…')).toBeNull();
  });
});

describe('MessageButton', () => {
  it('opens the conversation', async () => {
    mockRpcResults.start_conversation = 'c9';
    await wrap(<MessageButton userId="u1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Message' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'c9' } }));
  });

  it('explains when the person does not accept messages', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockRpcResults.start_conversation = new Error('PL8_MESSAGING_CLOSED');
    await wrap(<MessageButton userId="u1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Message' }));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Message', 'This person isn’t accepting new messages from you.'),
    );
    expect(mockPush).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

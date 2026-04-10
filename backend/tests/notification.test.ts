import { sendNotification } from '../src/services/notification';

jest.mock('../src/data/models/Notification', () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue({ _id: 'n1', type: 'TEST', message: 'Hello' }),
  },
}));

describe('Notification service', () => {
  jest.setTimeout(10000);

  it('sendNotification resolves without throwing (DB mocked)', async () => {
    process.env.MAILER = 'ethereal';

    await expect(
      sendNotification({
        userId: null as any,
        type: 'TEST',
        message: 'Hello',
        channel: 'email',
        email: { subject: 'Hi', html: '<p>Hi</p>' },
      })
    ).resolves.toBeUndefined();
  });
});

import { sendNotification } from '../src/services/notification';
import User from '../src/data/models/User';

describe('Notification service', () => {
  jest.setTimeout(10000);

  it('sends email with ethereal transport without throwing', async () => {
    process.env.MAILER = 'ethereal';

    // Create a dummy user object (no DB required for this simple test)
    const user = new User({ name: 'Test User', email: 'test+ethereal@example.com', role: ['client'] });
    await user.validate();

    await expect(sendNotification({ userId: null as any, type: 'TEST', message: 'Hello', channel: 'email', email: { subject: 'Hi', html: '<p>Hi</p>' } })).resolves.toBeUndefined();
  });
});

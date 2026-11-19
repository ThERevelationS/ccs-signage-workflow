import { sendSmtp } from 'file:///app/base44/shared/smtpClient.ts';
try {
  const r = await sendSmtp({
    host: 'smtp.ionos.com', port: 587,
    user: 'noreply-probe@example.invalid', pass: 'fake-password-not-real',
    from: 'noreply-probe@example.invalid', to: ['nobody@example.invalid'],
    subject: 'transport smoke test', text: 'hello',
  });
  console.log('UNEXPECTED_SEND_OK ' + JSON.stringify(r));
} catch (e) {
  const k = (e && e.kind) || 'unknown';
  console.log('SMTP_ERROR_KIND=' + k + ' MSG=' + String((e && e.message) || e).slice(0, 160));
}

const title = `OpenDesk notification interaction ${Date.now()}`;
const message = "Own-app list, wait and dismiss smoke";

const pending = Notifications.waitFor({
  title,
  message,
  timeout: 15000,
});

notify({ title, message, sound: false });

const delivered = await pending;
console.log("notification delivered", {
  id: delivered.id,
  appId: delivered.appId,
  deliveredAt: delivered.deliveredAt,
  contentRedacted: delivered.contentRedacted,
});

const dismissed = await Notifications.dismiss(delivered.id);
console.log("notification dismissed", dismissed);

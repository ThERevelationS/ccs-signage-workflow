// Isolated, synthetic registered-user context. Do not import production auth.
export const useAuth = () => ({
  currentUser: { id: "synthetic-user", email: "sips.qa@example.test", role: "admin" },
  isRegistered: true,
});
export default function UnusedDialog() { return null; }

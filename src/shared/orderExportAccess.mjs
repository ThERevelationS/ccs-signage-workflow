// Order Form only: the general import/export permission does NOT grant this
// button. An explicit administrator grant is required and defaults to OFF.
export function canUseOrderExport(user) {
  return user?.role === 'admin' && user?.can_order_export === true;
}

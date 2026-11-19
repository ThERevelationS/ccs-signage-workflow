import React from 'react';

// Minimal stand-in for the Radix dialog wrapper: renders children into the DOM
// when open so text/role queries exercise the real markup of the candidates.
export const Dialog = ({ open, children }) => (open ? <div data-stub="dialog">{children}</div> : null);
export const DialogContent = ({ children, className }) => <div className={className}>{children}</div>;
export const DialogHeader = ({ children }) => <div>{children}</div>;
export const DialogTitle = ({ children, className }) => <h2 className={className}>{children}</h2>;

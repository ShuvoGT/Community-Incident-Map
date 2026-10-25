"use client";

import { VerifyPanel } from "./VerifyPanel";

// Sign in via the OTP flow. Reporters land on their reports; staff can then
// open the moderator queue.
export function LoginForm() {
  return (
    <VerifyPanel
      onVerified={() => {
        window.location.href = "../me";
      }}
    />
  );
}

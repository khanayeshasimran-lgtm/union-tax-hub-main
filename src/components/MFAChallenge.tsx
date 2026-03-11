import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function MFAChallenge({
  factorId,
  onSuccess
}: {
  factorId: string;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState("");

  const verify = async () => {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code
    });

    if (error) {
      alert("Invalid code");
      return;
    }

    onSuccess();
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="space-y-4 p-6 border rounded-lg bg-white">
        <h2 className="font-semibold">Enter 2FA Code</h2>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="6 digit code"
          className="border px-2 py-1 rounded"
        />

        <button
          onClick={verify}
          className="px-4 py-2 bg-black text-white rounded"
        >
          Verify
        </button>
      </div>
    </div>
  );
}
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function MFASetup() {
  const [qr, setQr] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const setup = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator App"
    });

    if (error || !data) {
      console.error(error);
      return;
    }

    setQr(data.totp.qr_code);
    setFactorId(data.id);
  };

  const verify = async () => {
    if (!factorId) return;

    // create challenge
    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError || !challengeData) {
      console.error(challengeError);
      return;
    }

    setChallengeId(challengeData.id);

    // verify challenge
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code
    });

    if (error) {
      alert("Invalid code");
      return;
    }

    alert("2FA Enabled Successfully");
    setQr(null);
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <h3 className="font-semibold">Two-Factor Authentication</h3>

      {!qr && (
        <button
          onClick={setup}
          className="px-4 py-2 bg-black text-white rounded"
        >
          Enable 2FA
        </button>
      )}

      {qr && (
        <>
          <img src={qr} alt="QR Code" />

          <input
            placeholder="Enter 6 digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="border px-2 py-1 rounded"
          />

          <button
            onClick={verify}
            className="px-4 py-2 bg-green-600 text-white rounded"
          >
            Verify
          </button>
        </>
      )}
    </div>
  );
}
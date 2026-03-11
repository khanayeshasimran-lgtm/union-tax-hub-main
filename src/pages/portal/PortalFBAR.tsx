import { PortalHeader } from "@/components/PortalHeader";
import { Download, AlertCircle, CheckCircle2 } from "lucide-react";

const requirements = [
  "You had financial interest in or signature authority over at least one financial account located outside the US",
  "The aggregate value of all foreign financial accounts exceeded $10,000 at any time during the calendar year",
  "Account types include bank accounts, securities accounts, and other financial accounts",
  "FBAR must be filed with FinCEN (Financial Crimes Enforcement Network), not the IRS",
  "Deadline: April 15 with automatic extension to October 15",
];

const penalties = [
  { type: "Non-willful violation", amount: "Up to $10,000 per violation" },
  { type: "Willful violation", amount: "Greater of $100,000 or 50% of account balance" },
  { type: "Criminal penalties", amount: "Up to $250,000 and/or 5 years imprisonment" },
];

export default function PortalFBAR() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-5">
            <AlertCircle className="h-5 w-5 text-blue-500" />
            <h2 className="text-blue-600 font-semibold text-base">FBAR QUESTIONNAIRE</h2>
          </div>

          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            <strong>FBAR (Foreign Bank Account Report)</strong> — FinCEN Form 114 — must be filed
            by United States persons who have a financial interest in or signature authority over
            foreign financial accounts. If you meet any of the following criteria, you are required
            to file.
          </p>

          <div className="space-y-2.5">
            {requirements.map((req, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">{req}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Penalties card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">Penalties for Non-Compliance</h3>
          <div className="space-y-2">
            {penalties.map((p, i) => (
              <div key={i} className="flex items-start justify-between gap-4 p-3 bg-red-50 rounded-lg border border-red-100">
                <span className="text-sm font-medium text-red-700">{p.type}</span>
                <span className="text-sm text-red-600 text-right">{p.amount}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Download card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 text-sm mb-2">FBAR Questionnaire Form</h3>
          <p className="text-sm text-gray-500 mb-4">
            Please download the questionnaire, fill it out, and upload it back in the
            Upload Tax Documents section.
          </p>
          <a
            href="https://bsaefiling.fincen.treas.gov/NoRegFBARFiler.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#1e2a4a] hover:bg-[#2d3a5c] text-white font-semibold px-6 py-2.5 rounded-full transition-all text-sm"
          >
            <Download className="h-4 w-4" />
            Go to FinCEN FBAR Filing
          </a>
        </div>
      </div>
    </div>
  );
}

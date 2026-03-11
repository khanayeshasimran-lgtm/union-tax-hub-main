import { PortalHeader } from "@/components/PortalHeader";
import { Download, FolderOpen, CheckCircle2 } from "lucide-react";

const sections = [
  {
    title: "Personal Information",
    items: ["Social Security Numbers for all family members", "Date of birth for all family members", "Valid government-issued ID"],
  },
  {
    title: "Income Documents",
    items: ["W-2 from all employers", "1099-NEC / 1099-MISC (freelance/contract income)", "1099-INT (bank interest)", "1099-DIV (dividends)", "1099-R (retirement distributions)", "Social Security benefit statement (SSA-1099)"],
  },
  {
    title: "Deductions & Credits",
    items: ["Mortgage interest statement (Form 1098)", "Property tax bills", "Charitable contribution receipts", "Student loan interest (1098-E)", "Childcare provider name, address, and Tax ID", "Education expenses (1098-T)"],
  },
  {
    title: "Business / Self-Employment",
    items: ["Gross receipts / sales records", "Business expense receipts", "Home office measurements (sq ft)", "Vehicle mileage logs", "Business asset purchases"],
  },
  {
    title: "Foreign Income & Accounts",
    items: ["Foreign income records", "Foreign bank account details (FBAR)", "Form 8938 (FATCA) if applicable", "Foreign tax paid receipts"],
  },
  {
    title: "Other",
    items: ["Prior year tax return (federal + state)", "IRS Identity Protection PIN (if issued)", "Estimated tax payments made", "Health insurance coverage info (ACA)"],
  },
];

export default function PortalOrganizer() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-5">
            <FolderOpen className="h-5 w-5 text-blue-500" />
            <h2 className="text-blue-600 font-semibold text-base">2025 TAX ORGANIZER</h2>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Use this organizer to gather all documents you'll need to file your 2025 federal and state
            tax returns. Having everything ready in advance helps us prepare an accurate return quickly
            and ensures you don't miss any deductions or credits you're entitled to.
          </p>

          <a
            href="#"
            onClick={e => e.preventDefault()}
            className="mt-5 inline-flex items-center gap-2 bg-[#1e2a4a] hover:bg-[#2d3a5c] text-white font-semibold px-6 py-2.5 rounded-full transition-all text-sm"
          >
            <Download className="h-4 w-4" />
            Download Tax Organizer PDF
          </a>
          <p className="text-xs text-gray-400 mt-2">
            Your agent will provide you with the PDF document directly.
          </p>
        </div>

        {/* Checklist grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((section) => (
            <div key={section.title} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-3 pb-2 border-b border-gray-100">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5" />
                    <span className="text-xs text-gray-600 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Upload reminder */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-700">
          <strong>Next step:</strong> Once you've gathered your documents, head to{" "}
          <strong>Upload Tax Documents</strong> in the sidebar to submit them securely.
        </div>
      </div>
    </div>
  );
}

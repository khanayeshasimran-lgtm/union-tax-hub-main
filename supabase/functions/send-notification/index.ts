// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "Union Tax Hub <onboarding@resend.dev>";

interface NotificationPayload {
  type:
    | "estimation_approved"
    | "estimation_rejected"
    | "lead_assigned"
    | "followup_due"
    | "document_approved"
    | "document_rejected";
  to: string;
  data: Record<string, any>;
}

const templates: Record<string, (d: any) => { subject: string; html: string }> = {
  estimation_approved: (d) => ({
    subject: `✅ Estimation Approved — ${d.client_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#16a34a;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">✅ Estimation Approved</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="color:#374151">Hi ${d.agent_name},</p>
          <p style="color:#374151">An estimation has been <strong>approved</strong> and the case is ready to progress.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr style="background:#f9fafb">
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Client</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.client_name}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Estimated Fee</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#16a34a;font-weight:600">$${d.estimated_fee}</td>
            </tr>
            <tr style="background:#f9fafb">
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Completion</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.completion_days ? d.completion_days + " days" : "—"}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Approved By</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.approved_by}</td>
            </tr>
          </table>
          <p style="color:#6b7280;font-size:14px">The case stage has been advanced to <strong>Estimation Approved</strong>. You can now proceed with filing.</p>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">
            <p style="color:#9ca3af;font-size:12px;margin:0">Union Tax Hub · Automated Notification</p>
          </div>
        </div>
      </div>
    `,
  }),

  estimation_rejected: (d) => ({
    subject: `❌ Estimation Rejected — ${d.client_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#dc2626;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">❌ Estimation Rejected</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="color:#374151">Hi ${d.agent_name},</p>
          <p style="color:#374151">An estimation has been <strong>rejected</strong> and requires revision.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr style="background:#f9fafb">
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Client</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.client_name}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Estimated Fee</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">$${d.estimated_fee}</td>
            </tr>
          </table>
          ${d.reason ? `
          <div style="background:#fef2f2;border:1px solid #fecaca;padding:16px;border-radius:8px;margin:16px 0">
            <p style="color:#991b1b;font-weight:600;margin:0 0 8px 0">Rejection Reason:</p>
            <p style="color:#b91c1c;margin:0">${d.reason}</p>
          </div>
          ` : ""}
          <p style="color:#6b7280;font-size:14px">Please revise the estimation and resubmit for approval.</p>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">
            <p style="color:#9ca3af;font-size:12px;margin:0">Union Tax Hub · Automated Notification</p>
          </div>
        </div>
      </div>
    `,
  }),

  lead_assigned: (d) => ({
    subject: `📋 New Lead Assigned — ${d.lead_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#4f46e5;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">📋 New Lead Assigned</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="color:#374151">Hi ${d.agent_name},</p>
          <p style="color:#374151">A new lead has been assigned to you.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr style="background:#f9fafb">
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Lead Name</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.lead_name}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Phone</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.phone || "—"}</td>
            </tr>
            <tr style="background:#f9fafb">
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Source</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.source || "—"}</td>
            </tr>
          </table>
          <p style="color:#6b7280;font-size:14px">Log in to Union Tax Hub to view and contact this lead.</p>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">
            <p style="color:#9ca3af;font-size:12px;margin:0">Union Tax Hub · Automated Notification</p>
          </div>
        </div>
      </div>
    `,
  }),

  followup_due: (d) => ({
    subject: `⏰ Follow-Up Due — ${d.lead_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#d97706;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">⏰ Follow-Up Due Today</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="color:#374151">Hi ${d.agent_name},</p>
          <p style="color:#374151">You have a follow-up due today.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr style="background:#f9fafb">
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Lead</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.lead_name}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Phone</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.phone || "—"}</td>
            </tr>
            <tr style="background:#f9fafb">
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Notes</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.notes || "—"}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Due</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#d97706;font-weight:600">${d.due_date}</td>
            </tr>
          </table>
          <p style="color:#6b7280;font-size:14px">Log in to Union Tax Hub to complete this follow-up.</p>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">
            <p style="color:#9ca3af;font-size:12px;margin:0">Union Tax Hub · Automated Notification</p>
          </div>
        </div>
      </div>
    `,
  }),

  document_approved: (d) => ({
    subject: `📄 Document Approved — ${d.document_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#16a34a;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">📄 Document Approved</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="color:#374151">Hi ${d.agent_name},</p>
          <p style="color:#374151">A document has been <strong>approved</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr style="background:#f9fafb">
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Document</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.document_name}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Client</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.client_name}</td>
            </tr>
          </table>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">
            <p style="color:#9ca3af;font-size:12px;margin:0">Union Tax Hub · Automated Notification</p>
          </div>
        </div>
      </div>
    `,
  }),

  document_rejected: (d) => ({
    subject: `📄 Document Rejected — ${d.document_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#dc2626;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">📄 Document Rejected</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="color:#374151">Hi ${d.agent_name},</p>
          <p style="color:#374151">A document has been <strong>rejected</strong> and needs to be re-uploaded.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr style="background:#f9fafb">
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Document</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.document_name}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#374151">Client</td>
              <td style="padding:10px;border:1px solid #e5e7eb;color:#374151">${d.client_name}</td>
            </tr>
          </table>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">
            <p style="color:#9ca3af;font-size:12px;margin:0">Union Tax Hub · Automated Notification</p>
          </div>
        </div>
      </div>
    `,
  }),
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const payload: NotificationPayload = await req.json();
    const { type, to, data } = payload;

    const template = templates[type];
    if (!template) {
      return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), { status: 400 });
    }

    const { subject, html } = template(data);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("Resend error:", result);
      return new Response(JSON.stringify({ error: result }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
// Default Code of Conduct agreement HTML for IPC Diamond Membership.
// Stored as `html_content` on a code_of_conduct_templates row.
// Variables ({{member_name}}, {{program_name}}, {{party_a_name}}) are filled
// at render time on the public signing page.

export const DEFAULT_AGREEMENT_HTML = `
<h2>India Photographers' Club — Diamond Membership Code of Conduct</h2>
<p><strong>Agreement Date:</strong> {{today}}</p>

<h3>1. Parties</h3>
<p>
  <strong>Party A:</strong> {{party_a_name}} ("IPC").<br/>
  <strong>Party B:</strong> {{member_name}} ("Member"), email {{member_email}}.
</p>

<h3>2. Program</h3>
<p>
  This acknowledgement is for participation in the
  <strong>{{program_name}}</strong>. Access to the official Diamond Members
  WhatsApp group, learning resources, and member-only sessions begins only
  after this Code of Conduct has been digitally acknowledged.
</p>

<h3>3. IPC Responsibilities</h3>
<ul>
  <li>Provide the program content and live sessions as published in the program brochure.</li>
  <li>Maintain the official member groups and respond on official support channels.</li>
  <li>Communicate any schedule or program changes through official channels.</li>
</ul>

<h3>4. Member Responsibilities</h3>
<ul>
  <li>Treat all members, mentors, and staff with respect at all times.</li>
  <li>Do not share, resell, screen-record, or redistribute any program material.</li>
  <li>Do not promote unrelated products, services or paid offers inside member groups.</li>
  <li>Use the official support channels for queries; do not contact mentors privately for support.</li>
  <li>Provide accurate contact information and keep it updated.</li>
</ul>

<h3>5. Group &amp; Access Rules</h3>
<ul>
  <li>Access is personal and non-transferable.</li>
  <li>IPC may remove a member from the group for repeated violations of this Code of Conduct.</li>
  <li>Any abusive, discriminatory, or harassing behaviour will result in immediate removal.</li>
</ul>

<h3>6. Payment &amp; Refund</h3>
<p>
  Program fees, instalments and refund eligibility are governed by the
  payment terms communicated at the time of enrolment. Acknowledging this
  Code of Conduct does not change those payment terms.
</p>

<h3>7. Confidentiality</h3>
<p>
  Discussions, recordings, peer work and any private member information
  shared inside the Diamond Members group are confidential and must not be
  shared outside the group without explicit consent.
</p>

<h3>8. Acknowledgement</h3>
<p>
  By signing below, the Member confirms that they have read, understood and
  agree to abide by this Code of Conduct, and that the name and email
  displayed above belong to them.
</p>

<p style="color:#64748b;font-size:12px;margin-top:24px">
  This is a digital acknowledgement. The signed copy, IP address, user
  agent, timestamp and typed/drawn signature are stored as evidence of
  acknowledgement.
</p>
`.trim();

export const DEFAULT_AGREEMENT_VARS = (input: {
  member_name?: string | null;
  member_email?: string | null;
  program_name?: string | null;
  party_a_name?: string | null;
}) => ({
  member_name: input.member_name || "Member",
  member_email: input.member_email || "—",
  program_name: input.program_name || "IPC Diamond Membership",
  party_a_name: input.party_a_name || "India Photographers' Club",
  today: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
});

export function renderAgreementHtml(html: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
    html || "",
  );
}

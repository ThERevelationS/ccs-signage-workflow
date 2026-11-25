import React from "react";

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function List({ items }) {
  return (
    <ul className="list-disc ml-6 space-y-1">
      {items.map((item) => (
        <li key={typeof item === "string" ? item : item.key}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-600 mb-8">Last Updated: November 25, 2026</p>

        <div className="space-y-6 text-gray-700">
          <Section title="The short version">
            <p>
              CCS Signage Workflow is our internal app for running the shop: work orders, estimates,
              customers, permitting, production, the time clock, and the fleet. This page explains, in
              plain words, what we store, why we store it, how long we keep it, and how you can ask for
              a copy or for deletion.
            </p>
            <p className="font-medium text-gray-900">We do not sell your data. Ever.</p>
          </Section>

          <Section title="1. What we collect and why">
            <List
              items={[
                "Account details — your name, email address, a password (stored securely by our login provider, never as readable text), and your access level. Why: so you can sign in and see the parts of the app your job needs.",
                "Job records — work orders, estimates, quotes, invoices, purchase orders, change orders, permitting notes, and any files or photos attached to them. Why: to do the work and keep a record of it.",
                "Customer and contact details — customer company names, contact names, phone numbers, email addresses, billing and job-site addresses, and notes about the customer. Why: to quote, schedule, permit, deliver, and invoice their work.",
                "Time clock records — clock-in and clock-out times, breaks, work pauses, corrections, PTO balances, and time-off requests (dates, type, hours, reason, and approver notes). Why: to pay people correctly and plan staffing.",
                "A face template for the time clock — explained in section 3 below.",
                "HR details you enter about yourself — home address, personal phone number, date of birth, hire date, emergency contacts (name, relationship, phone numbers), and clothing sizes for uniforms. Why: to reach someone in an emergency, keep required employment records, and order uniforms.",
                "Fleet records — vehicle location, trips, mileage, fuel, maintenance, inspections, and notes tied to company vehicles. Why: to run, service, and keep our trucks safe.",
                "Activity history — a record of who changed what and when. Why: so job records stay accurate and mistakes can be traced and fixed.",
              ]}
            />
          </Section>

          <Section title="2. How we use your information">
            <p className="mb-2">We use what we collect only to run the business and the app:</p>
            <List
              items={[
                "Providing and maintaining the workflow management service",
                "Signing you in and giving you the right level of access",
                "Doing, scheduling, permitting, and billing the work",
                "Running the time clock, payroll preparation, PTO, and time-off approvals",
                "Displaying files you've selected from your Google Drive within work orders",
                "Keeping company vehicles serviced and safe",
              ]}
            />
          </Section>

          <Section title="3. Face scans for the time clock">
            <p>
              The time clock can recognize you by your face so you can clock in quickly and so one
              employee can't clock in for another. Here is exactly what happens:
            </p>
            <List
              items={[
                "When an administrator enrolls you (or you enroll yourself in your settings), the camera takes a few pictures of your face in that moment.",
                "Those pictures are used only to build a numeric face template — a long set of numbers describing measurements of your face. The template is what gets saved. The photos themselves are not stored.",
                "When you clock in, the camera compares your live face to your saved template to confirm it's you.",
                "Your template is used only by the time clock. It is not shown on screen to other employees. Administrators can see whether you are enrolled, and can remove your enrollment.",
                "We ask for your consent on the enrollment screen before a template is saved. If you'd rather not, you can still clock in with your badge or a manual punch.",
                "You can withdraw consent at any time: ask an administrator to delete your face enrollment and your template is removed.",
              ]}
            />
          </Section>

          <Section title="4. Google Drive access">
            <p className="mb-2">When you connect Google Drive:</p>
            <List
              items={[
                "We only access files you explicitly select through the file picker",
                "We store references (file IDs) to display these files in your work orders",
                "We do not download, modify, or share your Google Drive files",
                "You can revoke access at any time through your Google Account settings",
              ]}
            />
          </Section>

          <Section title="5. How long we keep it">
            <List
              items={[
                "Job, customer, and financial records — kept while the account is active and afterwards for as long as we need them for warranty, tax, and legal recordkeeping.",
                "Time clock, time-off, and PTO records — kept for payroll and employment recordkeeping.",
                "HR details — kept while you work here and for as long as employment law requires after you leave.",
                "Face template — kept only until you or an administrator removes your enrollment, or your account is deleted.",
                "Google Drive — we keep only the file references (IDs) you linked. Remove the link and we no longer reference the file.",
              ]}
            />
          </Section>

          <Section title="6. We do not sell your data">
            <p className="mb-2">
              We do not sell, rent, or trade your personal information. We share it only:
            </p>
            <List
              items={[
                "With the services that host and run the app (Base44) and, only when you choose to link files, with Google",
                "With your explicit consent",
                "To comply with legal obligations",
                "To protect our rights and safety",
              ]}
            />
          </Section>

          <Section title="7. Getting a copy, fixing it, or deleting it">
            <List
              items={[
                "A copy — ask a CCS administrator and they can export the records we hold about you.",
                "A correction — update your own details in your settings, or ask an administrator to fix anything else.",
                "Deletion — in your settings you can submit an account deletion request, which an administrator reviews and completes. You can also ask an administrator to delete your face enrollment or specific records at any time.",
                "We'll respond as soon as we can, normally within 30 days. A few records, such as invoices, may have to be kept for legal or tax reasons; we'll tell you if that applies.",
              ]}
            />
          </Section>

          <Section title="8. Data storage and security">
            <p>
              Your data is stored securely on Base44's infrastructure. We implement industry-standard
              security measures to protect your information from unauthorized access, alteration, or
              destruction, and access inside the app is limited by your role.
            </p>
          </Section>

          <Section title="9. Scope of Google Drive API use">
            <p className="mb-2">
              Our use of information received from Google APIs adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p>We only use the Google Drive API to:</p>
            <List
              items={[
                "Allow you to select and link specific files to your work orders",
                "Display metadata and thumbnails of files you've selected",
                "Provide direct links to open your files in Google Drive",
              ]}
            />
          </Section>

          <Section title="10. Changes to this policy">
            <p>
              We may update this privacy policy from time to time. We will notify you of any changes by
              posting the new policy on this page and updating the "Last Updated" date.
            </p>
          </Section>

          <Section title="11. Contact us">
            <p>
              If you have questions about this privacy policy, or want a copy of your data or a deletion,
              please contact a CCS administrator through the app or your manager.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
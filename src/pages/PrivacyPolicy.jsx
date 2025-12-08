import React from "react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
        <p className="text-sm text-gray-600 mb-8">Last Updated: December 8, 2025</p>

        <div className="space-y-6 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Information We Collect</h2>
            <p className="mb-2">We collect the following information to provide our workflow management services:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Email address and name for user authentication</li>
              <li>Work order and project information you create</li>
              <li>Google Drive file access when you choose to link files to work orders</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. How We Use Your Information</h2>
            <p className="mb-2">Your information is used solely for:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Providing and maintaining the workflow management service</li>
              <li>Displaying files you've selected from your Google Drive within work orders</li>
              <li>Authenticating your access to the application</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Google Drive Access</h2>
            <p className="mb-2">When you connect Google Drive:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>We only access files you explicitly select through the file picker</li>
              <li>We store references (file IDs) to display these files in your work orders</li>
              <li>We do not download, modify, or share your Google Drive files</li>
              <li>You can revoke access at any time through your Google Account settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Data Storage and Security</h2>
            <p>Your data is stored securely on Base44's infrastructure. We implement industry-standard security measures to protect your information from unauthorized access, alteration, or destruction.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Sharing</h2>
            <p>We do not sell, trade, or share your personal information with third parties except:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>With your explicit consent</li>
              <li>To comply with legal obligations</li>
              <li>To protect our rights and safety</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Your Rights</h2>
            <p className="mb-2">You have the right to:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Access and review your personal information</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and data</li>
              <li>Revoke Google Drive access at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Scope of Google Drive API Use</h2>
            <p className="mb-2">Our use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
            <p>We only use the Google Drive API to:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Allow you to select and link specific files to your work orders</li>
              <li>Display metadata and thumbnails of files you've selected</li>
              <li>Provide direct links to open your files in Google Drive</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Changes to This Policy</h2>
            <p>We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last Updated" date.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Contact Us</h2>
            <p>If you have questions about this privacy policy or your data, please contact us through the application support channels.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'

export const metadata = {
  title: 'Terms & Conditions | Clearday',
}

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-32 pb-24 md:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">Terms & Conditions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: July 21, 2026</p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-4">
            <p>
              These Terms and Conditions ("Terms") govern your access to and use of the Clearday
              mobile application and any associated services, features, or functionality provided
              through it (collectively, the "Service").
            </p>
            <p>
              By downloading, installing, accessing, or using Clearday, you agree to be bound by
              these Terms. If you do not agree with these Terms, you must not install or use the
              application.
            </p>
            <p>
              These Terms constitute a legally binding agreement between you ("User", "you", or
              "your") and the developer and operator of Clearday ("Clearday", "we", "us", or
              "our").
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">1. Description of the Service</h2>
            <div className="space-y-4">
              <p>
                Clearday is a mobile application designed to help you capture reminders, calendar
                events, and notes in whatever form they come to you — typed or spoken — and to
                automatically determine what kind of item you've captured and when you should be
                reminded about it.
              </p>
              <p>
                To provide this functionality, Clearday processes the text of what you capture
                (including text transcribed from voice input) using a third-party AI language model
                provider, stores your reminders, events, and notes primarily on your device, and
                may offer optional features such as calendar integration, text-to-speech playback,
                offline capture, and premium subscription tiers.
              </p>
              <p>
                Clearday is intended as a personal productivity and organizational tool. It is not
                a guaranteed method of ensuring you never miss a deadline, appointment, or task, and
                you remain responsible for your own schedule and obligations.
              </p>
              <p>
                We reserve the right to modify, improve, suspend, or discontinue the Service or any
                part of the Service at any time, with or without notice.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">2. Eligibility and Acceptable Use</h2>
            <div className="space-y-4">
              <p>
                You must be at least 13 years of age to use Clearday. If you are under the age of
                majority in your jurisdiction, you may only use the Service with the consent and
                supervision of a parent or legal guardian.
              </p>
              <p>By using the Service, you represent and warrant that:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>You meet the age requirements stated above.</li>
                <li>You have the legal capacity to enter into these Terms.</li>
                <li>You will use the Service in compliance with all applicable laws and regulations.</li>
              </ul>
              <p>
                You agree not to use Clearday in any way that could damage, disable, overburden, or
                impair the application, or interfere with other users' access to the Service. You
                further agree not to use the Service to capture, transmit, or store unlawful,
                fraudulent, abusive, or harmful content, and not to attempt to use the Service for
                any purpose other than personal productivity and organization.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">3. License Grant</h2>
            <div className="space-y-4">
              <p>
                Subject to your compliance with these Terms, Clearday grants you a limited,
                non-exclusive, non-transferable, non-sublicensable, and revocable license to
                download, install, and use the Clearday application solely for personal,
                non-commercial use on devices that you own or control.
              </p>
              <p>
                This license does not grant you ownership of the software or any intellectual
                property rights associated with the application. Except as expressly permitted
                under these Terms, you may not:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Copy or reproduce the application</li>
                <li>Modify or create derivative works based on the application</li>
                <li>Distribute, sell, lease, sublicense, or commercially exploit the application</li>
                <li>Reverse engineer, decompile, or attempt to extract the source code</li>
                <li>Circumvent or attempt to bypass any technical limitations or protections</li>
              </ul>
              <p>Any unauthorized use of the application may result in termination of this license.</p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">
              4. AI Processing and Content You Submit
            </h2>
            <div className="space-y-4">
              <p>
                Clearday relies on a third-party AI language model provider, Groq, to interpret the
                text and voice input you submit, determine what type of item it represents, extract
                relevant dates and details, and generate AI-assisted content such as your daily
                brief.
              </p>
              <p>
                By using the capture features of Clearday, you acknowledge and agree that the text
                of your input — including transcriptions of voice recordings — will be transmitted
                to this third-party provider for processing. You should not submit sensitive
                information such as passwords, financial account numbers, government identification
                numbers, or health information through the capture feature.
              </p>
              <p>
                AI-generated interpretations, categorizations, and reminder times are provided on a
                best-effort basis. Clearday does not guarantee that AI processing will always
                correctly interpret your input, and you are responsible for reviewing and, where
                necessary, correcting any reminder, event, or note before relying on it.
              </p>
              <p>
                Further detail on how your content is processed and stored is available in the
                Clearday Privacy Policy, which forms part of these Terms.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">5. Permissions and Device Interaction</h2>
            <div className="space-y-4">
              <p>
                Clearday may request certain device permissions in order to function, including
                microphone access (for voice capture), notification access (to deliver reminders),
                calendar access (for optional calendar integration), and network access (to process
                captured content and detect offline status).
              </p>
              <p>
                You retain full control over whether these permissions are granted and may disable
                them at any time through your device settings. Disabling a given permission may
                prevent the corresponding feature from functioning correctly, but will not disable
                the application as a whole.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">6. Service Functionality and Limitations</h2>
            <div className="space-y-4">
              <p>
                Clearday attempts to accurately interpret and categorize your captured input, but
                accuracy may vary based on the clarity of your input, network conditions, device
                compatibility, and the inherent limitations of AI language processing.
              </p>
              <p>As a result, Clearday does not guarantee:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Perfectly accurate interpretation of every captured item</li>
                <li>Continuous or uninterrupted operation</li>
                <li>Delivery of every notification or reminder at the precise intended time</li>
                <li>Compatibility with all devices or operating system versions</li>
              </ul>
              <p>
                Clearday is an assistive productivity tool and should not be relied upon as the sole
                method of tracking time-critical, safety-critical, legal, or financial obligations.
                You remain responsible for independently verifying important deadlines and
                appointments.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">7. Subscriptions and Payments</h2>
            <div className="space-y-4">
              <p>
                Certain features of Clearday may be offered as a paid subscription ("Subscription").
                By selecting a Subscription, you agree to pay the fees indicated for that plan at
                the time of purchase.
              </p>
              <p>
                Subscription payments are processed through the Apple App Store or Google Play
                billing systems and managed with the assistance of RevenueCat. Payments will be
                charged to your account at the time of purchase and at the start of each renewal
                period. Subscription fees are non-refundable, except where required by applicable
                law or app store policy.
              </p>
              <p>
                You may cancel your Subscription at any time through your device's app store
                account settings. Your access to premium features will continue until the end of
                your current billing period. We reserve the right to change our subscription fees at
                any time, and will provide reasonable notice before any price changes take effect
                for existing subscribers.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">8. User Responsibilities</h2>
            <div className="space-y-4">
              <p>
                You are solely responsible for the accuracy of the information you capture in
                Clearday, for how you use your mobile device, and for how you respond to
                notifications and reminders generated by the application.
              </p>
              <p>You are also responsible for ensuring that:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Your device is compatible with the application</li>
                <li>You maintain the security of your device and account</li>
                <li>You comply with all applicable laws while using the Service</li>
              </ul>
              <p>
                Clearday does not control or modify the functionality of third-party applications
                installed on your device, including your device's calendar application, and is not
                responsible for the content, behavior, or services provided by those applications.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">9. Third-Party Services</h2>
            <div className="space-y-4">
              <p>
                Clearday relies on and interacts with certain third-party services in order to
                function, including Groq for AI content processing, RevenueCat for subscription
                management, and the Apple App Store and Google Play for distribution and billing.
              </p>
              <p>
                Clearday does not control and is not responsible for the policies, availability, or
                practices of these third-party services. Your use of any third-party service
                accessed through or alongside Clearday is governed by that service's own terms and
                privacy policy.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">10. No Professional Advice</h2>
            <div className="space-y-4">
              <p>
                Clearday is not intended to provide legal, financial, medical, or professional
                advice of any kind. The Service is designed solely as a personal productivity and
                organizational tool.
              </p>
              <p>
                Any categorization, prioritization, or scheduling suggestion generated by Clearday
                is provided for organizational convenience only and should not be treated as
                professional guidance. If you require advice regarding legal, financial, medical, or
                other professional matters, you should consult a qualified professional.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">11. Privacy and Data Handling</h2>
            <div className="space-y-4">
              <p>
                Your use of Clearday is also governed by the Clearday Privacy Policy, which explains
                how information — including content you capture and voice input — is collected,
                processed, stored, shared, and protected.
              </p>
              <p>
                By using the application, you acknowledge that you have read and understood the
                Privacy Policy and agree to the practices described in it. The Privacy Policy forms
                an integral part of these Terms.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">12. Software Updates and Modifications</h2>
            <div className="space-y-4">
              <p>We may release updates, patches, bug fixes, or new features from time to time. These updates may:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Improve performance</li>
                <li>Modify or remove existing features</li>
                <li>Introduce additional functionality</li>
                <li>Address security vulnerabilities</li>
              </ul>
              <p>
                Updates may be installed automatically depending on your device settings and
                application store policies. Continued use of the application following updates
                constitutes acceptance of any changes to the Service.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">13. Service Availability</h2>
            <div className="space-y-4">
              <p>The Service is provided on an "as available" and "as is" basis.</p>
              <p>
                While we strive to maintain reliable operation, we do not guarantee that the
                application will be error-free, continuously available, free from security
                vulnerabilities, or compatible with all devices or operating systems. We reserve the
                right to temporarily suspend or permanently discontinue the Service at any time,
                with or without prior notice.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">14. Disclaimer of Warranties</h2>
            <div className="space-y-4">
              <p>
                To the maximum extent permitted by applicable law, the Service is provided without
                warranties of any kind, either express or implied. This includes, but is not limited
                to, implied warranties of merchantability, fitness for a particular purpose, and
                non-infringement.
              </p>
              <p>
                Clearday does not guarantee that the application will meet your expectations or
                achieve specific results related to productivity, organization, or timely reminders.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">15. Limitation of Liability</h2>
            <div className="space-y-4">
              <p>
                To the fullest extent permitted by law, Clearday and its developers, affiliates, and
                partners shall not be liable for any indirect, incidental, consequential, or special
                damages arising from your use of or inability to use the Service. This includes, but
                is not limited to, missed appointments or deadlines, loss of data, loss of
                productivity, device malfunction, system interruptions, or personal or financial
                decisions made based on the use of the application.
              </p>
              <p>
                In jurisdictions where limitations of liability are restricted, liability shall be
                limited to the maximum extent permitted by applicable law.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">16. Indemnification</h2>
            <div className="space-y-4">
              <p>
                You agree to indemnify and hold harmless Clearday and its developers from any
                claims, damages, liabilities, losses, or expenses (including reasonable legal fees)
                arising from your use or misuse of the Service, your violation of these Terms, your
                violation of any applicable law or regulation, or your infringement of any
                third-party rights.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">17. Intellectual Property Rights</h2>
            <div className="space-y-4">
              <p>
                All rights, title, and interest in and to the Clearday application, including but
                not limited to its software, design, user interface, trademarks, logos, and
                functionality, remain the exclusive property of Clearday.
              </p>
              <p>
                Nothing in these Terms grants you ownership of the application or any associated
                intellectual property. You may not use Clearday branding, logos, or trademarks
                without prior written permission.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">18. Termination</h2>
            <div className="space-y-4">
              <p>
                We reserve the right to suspend or terminate your access to the Service at any time
                if we believe you have violated these Terms or engaged in behavior that may harm the
                Service or other users.
              </p>
              <p>
                You may terminate your use of the Service at any time by uninstalling the
                application from your device. Termination of access does not limit any rights or
                remedies available to Clearday under applicable law, and any outstanding
                subscription obligations remain governed by the applicable app store's terms.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">19. Changes to These Terms</h2>
            <div className="space-y-4">
              <p>
                We may update or revise these Terms from time to time. When updates occur, the "Last
                updated" date at the top of this document will be revised, and, where changes are
                material, we will provide additional notice within the app or through our official
                channels.
              </p>
              <p>
                Your continued use of the application following any changes constitutes acceptance
                of the revised Terms.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">20. Governing Law</h2>
            <div className="space-y-4">
              <p>
                These Terms shall be governed by and interpreted in accordance with the laws
                applicable in the jurisdiction in which the developer operates, without regard to
                conflict of law principles. Any disputes arising from or relating to these Terms or
                your use of the Service shall be resolved in the appropriate courts of that
                jurisdiction.
              </p>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-lg font-medium text-foreground">21. Contact Information</h2>
            <p>
              If you have any questions about these Terms and Conditions, you may contact us at:
            </p>
            <div className="w-fit rounded-2xl border border-border bg-muted/40 p-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-foreground">
                Support Email
              </p>
              <a
                href="mailto:support@clearday.com"
                className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                support@clearday.com
              </a>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
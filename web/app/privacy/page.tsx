import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'

export const metadata = {
  title: 'Privacy Policy | Clearday',
}

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-32 pb-24 md:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: July 21, 2026</p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-4">
            <p>
              Clearday ("Clearday", "we", "our", or "us") operates the Clearday mobile application
              and related services (together, the "Service"). This Privacy Policy explains what
              information we collect, how we use it, who we share it with, and the choices you
              have when you use Clearday.
            </p>
            <p>
              Clearday is designed to help you capture reminders, calendar events, and notes in
              whatever form they come to you — typed or spoken — and to work out on your behalf
              what kind of thing you've captured and when you should be reminded about it.
              Delivering that experience requires processing some of what you enter, including with
              the help of a third-party AI provider, which is why we want to be specific and
              transparent about exactly what happens to your information.
            </p>
            <p>
              By downloading, installing, or using Clearday, you agree to the practices described
              in this Privacy Policy. If you do not agree with this policy, please do not use the
              Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">1. Overview of Clearday</h2>
            <div className="space-y-4">
              <p>
                Clearday lets you capture anything on your mind — by typing or by speaking into the
                app — and automatically determines whether it is a reminder, a calendar event, an
                assignment, a deadline, or a general note, along with the most appropriate time to
                remind you about it.
              </p>
              <p>
                To do this, Clearday uses on-device storage for your captured items and sends the
                text of your input (including text transcribed from your voice) to a third-party AI
                language model provider for interpretation. Clearday also offers optional
                text-to-speech playback of your daily brief, calendar integration, offline capture,
                and premium subscription features.
              </p>
            </div>
          </section>

          <section className="space-y-8">
            <h2 className="text-lg font-medium text-foreground">2. Information We Collect</h2>

            <div className="space-y-3">
              <h3 className="text-base font-medium text-foreground">2.1 Content You Provide</h3>
              <p>When you use Clearday, you may provide the following types of content:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <span className="text-foreground">Typed input</span> — text you type into the
                  capture screen, including reminders, notes, tasks, and any other free-form text.
                </li>
                <li>
                  <span className="text-foreground">Voice input</span> — audio recorded when you use
                  the hold-to-speak microphone feature. This audio is transcribed to text in order
                  to be processed the same way as typed input.
                </li>
                <li>
                  <span className="text-foreground">Manually entered items</span> — reminders,
                  events, or notes entered through structured forms, including when using offline
                  capture mode.
                </li>
                <li>
                  <span className="text-foreground">Category, date, and time information</span> —
                  metadata associated with each captured item, such as its category (trip,
                  birthday, assignment, deadline, or general), due date, and reminder time.
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-medium text-foreground">2.2 Account and Subscription Information</h3>
              <p>
                If you subscribe to a premium tier of Clearday, subscription and billing
                transactions are processed by the applicable app store (Apple App Store or Google
                Play) and by our subscription management provider, RevenueCat. We receive and store
                your subscription status and tier locally on your device so the app can unlock the
                correct features. Clearday does not directly collect, process, or store your
                payment card details — these are handled entirely by Apple, Google, and RevenueCat
                under their own respective privacy policies.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-medium text-foreground">2.3 Calendar Information</h3>
              <p>
                If you choose to enable calendar integration, Clearday may read relevant event
                details (such as title, date, time, and location) from your device calendar in
                order to display them alongside your reminders and, where you request it, to create
                a corresponding reminder from a calendar event. Clearday only accesses calendar data
                you explicitly grant permission for, and this data is used solely to power the
                features you have enabled.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-medium text-foreground">2.4 Device and Usage Information</h3>
              <p>
                Clearday may collect limited technical information necessary for the app to
                function correctly and reliably, including:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Device type, operating system, and app version</li>
                <li>Network connectivity status (used to enable offline capture and syncing)</li>
                <li>General app performance and crash information</li>
              </ul>
              <p>
                This technical information is used only to maintain and improve the reliability of
                the Service and is not used to build an advertising profile about you.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">3. How Your Content Is Processed</h2>
            <div className="space-y-4">
              <p>
                When you capture a reminder, event, or note — whether typed or spoken — the text of
                that input is sent securely to Groq, a third-party AI inference provider, so that
                Clearday's underlying language model can determine what you meant (for example,
                whether it is a reminder, a calendar event, or a general note), extract relevant
                details such as dates and categories, and generate any AI-assisted content shown
                back to you, such as your daily brief.
              </p>
              <p>
                Voice input is transcribed to text before or as part of this process. The audio
                itself is used only to produce a transcription and is not retained by Clearday for
                any purpose beyond enabling this transcription and immediate AI processing.
              </p>
              <p>
                We do not use the content of your reminders, notes, or voice input to train our own
                machine learning models, and we do not sell this content to third parties. Groq
                processes this data on our behalf as a service provider, under its own data handling
                and retention practices, which you can review directly with Groq. We select
                infrastructure providers that are contractually and technically committed to
                appropriate data protection standards.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">4. Data Storage</h2>
            <div className="space-y-4">
              <p>
                Clearday stores your reminders, events, notes, categories, and preferences in a
                local database on your device. This local-first approach means that, for most
                everyday use, your captured content lives primarily on your own device rather than
                on our servers.
              </p>
              <p>
                Where cloud syncing or backup features are offered (for example, to keep your data
                available across devices or protect against data loss), your content may also be
                stored on secure cloud infrastructure. If and when such features are introduced or
                enabled, we will update this Privacy Policy to describe the storage provider and
                protections used.
              </p>
              <p>
                If you delete the Clearday application from your device, locally stored information
                may be removed along with the app, depending on your device's operating system
                behavior and whether cloud backup is enabled.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">5. Permissions Used by the Application</h2>
            <div className="space-y-4">
              <p>Clearday may request the following device permissions in order to operate properly:</p>
              <ul className="list-disc space-y-3 pl-5">
                <li>
                  <span className="text-foreground">Microphone:</span> allows you to use the
                  hold-to-speak feature to capture reminders, events, and notes by voice.
                </li>
                <li>
                  <span className="text-foreground">Notifications:</span> allows Clearday to remind
                  you about upcoming reminders, events, and deadlines at the time you specify.
                </li>
                <li>
                  <span className="text-foreground">Calendar access:</span> allows Clearday to
                  display your existing calendar events and, where requested, create reminders from
                  them. This permission is optional and only requested if you choose to enable
                  calendar features.
                </li>
                <li>
                  <span className="text-foreground">Network access:</span> allows Clearday to send
                  your captured text to our AI processing provider, sync data where applicable, and
                  detect when you are offline so the app can fall back to offline capture mode.
                </li>
              </ul>
              <p>
                You can deny or later revoke any of these permissions through your device settings.
                Doing so may limit or disable the corresponding features, but the rest of the app
                will continue to function.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">6. How We Use Information</h2>
            <div className="space-y-4">
              <p>Information processed by Clearday is used only for the following purposes:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Interpreting your captured input and classifying it into the correct category</li>
                <li>Determining appropriate reminder times and generating your daily brief</li>
                <li>Displaying, organizing, and reminding you about your reminders, events, and notes</li>
                <li>Enabling optional features such as calendar integration and text-to-speech playback</li>
                <li>Unlocking premium features associated with an active subscription</li>
                <li>Maintaining, securing, and improving the reliability of the Service</li>
              </ul>
              <p>We do not sell, rent, or trade your personal information to third parties.</p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">7. Data Sharing</h2>
            <div className="space-y-4">
              <p>
                We do not share your personal content with third parties for their own marketing or
                advertising purposes. We share information only with the following categories of
                service providers, and only to the extent necessary for them to perform services on
                our behalf:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <span className="text-foreground">Groq</span> — to process and interpret the text
                  of your captured reminders, events, and notes, as described in Section 3.
                </li>
                <li>
                  <span className="text-foreground">RevenueCat</span> — to manage and verify
                  subscription status and entitlements.
                </li>
                <li>
                  <span className="text-foreground">Apple and Google</span> — to process app store
                  transactions and, where applicable, provide push notification delivery
                  infrastructure.
                </li>
              </ul>
              <p>
                We may also disclose information if required to do so by law, or in the good-faith
                belief that such action is necessary to comply with a legal obligation, protect the
                rights or safety of Clearday, our users, or others, or investigate fraud or security
                issues.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">8. Data Retention</h2>
            <div className="space-y-4">
              <p>
                Your reminders, events, and notes are retained locally on your device for as long as
                you keep the application installed, or until you delete them within the app.
                Transcribed voice input and text sent to our AI processing provider is used only to
                generate a response to your request and is not retained by Clearday beyond what is
                necessary to deliver that response.
              </p>
              <p>
                If cloud backup or sync features are enabled, corresponding data will be retained on
                our cloud infrastructure until you delete it or delete your account, subject to
                standard backup retention periods.
              </p>
              <p>
                You may request deletion of any information we hold about you by contacting us
                using the details in Section 14.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">9. Subscription Services</h2>
            <div className="space-y-4">
              <p>
                Clearday offers optional premium subscription tiers that unlock additional
                functionality. Subscription purchases are processed through the Apple App Store or
                Google Play billing systems and managed using RevenueCat. Your subscription status
                is stored locally on your device to determine which features are available to you.
                Clearday does not directly store or have access to your full payment card details.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">10. Your Rights and Choices</h2>
            <div className="space-y-4">
              <p>Depending on where you live, you may have certain rights regarding your personal information, including the right to:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate or incomplete information</li>
                <li>Request deletion of your personal information</li>
                <li>Object to or restrict certain processing of your information</li>
                <li>Withdraw consent where processing is based on consent, such as microphone or calendar access</li>
                <li>Request a copy of your information in a portable format</li>
              </ul>
              <p>
                You can exercise most of these rights directly within the app — for example, by
                deleting individual reminders or notes, or by revoking permissions such as
                microphone or calendar access in your device settings. For requests we cannot fulfil
                directly within the app, you may contact us using the details in Section 14, and we
                will respond within a reasonable timeframe and in accordance with applicable law.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">11. Children's Privacy</h2>
            <div className="space-y-4">
              <p>
                Clearday is not directed to children under the age of 13, and we do not knowingly
                collect personal information from children under 13. If you believe a child has
                provided us with personal information, please contact us and we will take steps to
                delete such information.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">12. International Data Transfers</h2>
            <div className="space-y-4">
              <p>
                Clearday and the third-party service providers we use, including Groq and
                RevenueCat, may process and store information on servers located outside of your
                country of residence. Where this occurs, we take steps to ensure that appropriate
                safeguards are in place consistent with applicable data protection law.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">13. Security</h2>
            <div className="space-y-4">
              <p>
                We take reasonable technical and organizational measures designed to protect the
                information processed by Clearday, including transmitting data to our AI processing
                provider over encrypted connections. However, because most of your content is stored
                locally on your device, the overall security of that content also depends on the
                protections provided by your device's operating system and your own device security
                settings, such as using a passcode or biometric lock. No method of transmission or
                storage is completely secure, and we cannot guarantee absolute security.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">14. Changes to This Privacy Policy</h2>
            <div className="space-y-4">
              <p>
                We may update this Privacy Policy from time to time to reflect changes in our
                practices, the features we offer, or applicable law. When we make changes, we will
                revise the "Last updated" date at the top of this page and, where changes are
                material, provide additional notice within the app or through our official
                channels. Your continued use of Clearday after such changes constitutes your
                acceptance of the updated policy.
              </p>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-lg font-medium text-foreground">15. Contact Information</h2>
            <p>
              If you have questions, concerns, or requests regarding this Privacy Policy or how
              Clearday handles your information, you may contact us at:
            </p>
            <div className="w-fit rounded-2xl border border-border bg-muted/40 p-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-foreground">
                Contact Details
              </p>
              <div className="space-y-1.5">
                <p>
                  Email:{' '}
                  <a
                    href="mailto:support@clearday.com"
                    className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
                  >
                    support@clearday.com
                  </a>
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
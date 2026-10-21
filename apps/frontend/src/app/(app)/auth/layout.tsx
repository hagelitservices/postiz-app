import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { KaidoMark } from '@gitroom/frontend/components/kaido/kaido.mark';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();

  return (
    <MantineWrapper>
      <Toaster />
      <div className="bg-[#0E0E0E] flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen text-white">
        {/*<style>{`html, body {overflow-x: hidden;}`}</style>*/}
        <ReturnUrlComponent />
        <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#1A1919]">
          <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
            <LogoTextComponent />
            <div className="flex">{children}</div>
          </div>
        </div>
        {/* Kaido (I5): our own promise from publish.kaidostudios.de instead of
            Postiz' user counts and testimonials. */}
        <section
          aria-label="Kaido Publish"
          className="flex-1 hidden lg:flex flex-col justify-center px-[64px] py-[48px]"
        >
          <div className="max-w-[560px]">
            <KaidoMark size={56} />
            <h2 className="mt-[40px] text-[44px] font-[600] leading-[1.08] tracking-[-0.02em] text-balance">
              {t('kaido_auth_h1_1', 'One calendar.')}
              <br />
              {t('kaido_auth_h1_2', 'Every channel.')}
              <br />
              <span className="text-[#D4FF00]">
                {t('kaido_auth_h1_3', 'Nothing goes out unchecked.')}
              </span>
            </h2>
            <ol className="mt-[48px] flex flex-col gap-[28px] list-none p-0">
              {[
                [
                  '01',
                  t('kaido_auth_plan', 'Plan'),
                  t(
                    'kaido_auth_plan_text',
                    'One calendar for every brand and channel. Move dates, keep drafts, reuse posts.',
                  ),
                ],
                [
                  '02',
                  t('kaido_auth_review', 'Review'),
                  t(
                    'kaido_auth_review_text',
                    'Before each post you see the preview, the account and every setting. Settings a platform requires cannot be skipped.',
                  ),
                ],
                [
                  '03',
                  t('kaido_auth_publish', 'Publish'),
                  t(
                    'kaido_auth_publish_text',
                    'At the scheduled time the post goes out through the platform’s official API. The status shows up in the calendar.',
                  ),
                ],
              ].map(([n, title, text]) => (
                <li key={n} className="flex gap-[20px]">
                  <span className="font-mono text-[13px] text-[#D4FF00] pt-[4px] tabular-nums">
                    {n}
                  </span>
                  <span>
                    <span className="block text-[18px] font-[600]">
                      {title}
                    </span>
                    <span className="block mt-[6px] text-[15px] leading-[1.55] text-[#B9BEC0]">
                      {text}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </MantineWrapper>
  );
}

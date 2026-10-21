export const dynamic = 'force-dynamic';
import { Login } from '@gitroom/frontend/components/auth/login';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Kaido Publish' : 'Gitroom'} Login`,
  description: '',
};
export default async function Auth() {
  // Kaido (I5): accounts are set up by us, no public sign-up — hide the link too.
  return <Login registration={process.env.DISABLE_REGISTRATION !== 'true'} />;
}

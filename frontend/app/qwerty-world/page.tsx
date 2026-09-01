import { redirect } from 'next/navigation';

/** QwertyWorld was retired — discovery lives under QwertyMedia. */
export default function QwertyWorldRedirectPage() {
  redirect('/qwerty-media');
}

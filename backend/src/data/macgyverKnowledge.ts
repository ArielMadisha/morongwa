/**
 * Qwertymates FAQ knowledge base – answered locally before calling OpenAI
 * MacGyver knows everything about the website. Add patterns and answers here.
 */

export interface QwertymatesFAQ {
  /** Keywords/phrases that trigger this answer (case-insensitive, any match) */
  patterns: string[];
  /** The answer to return */
  answer: string;
}

export const QWERTYMATES_FAQS: QwertymatesFAQ[] = [
  // ─── QwertyHub ─────────────────────────────────────────────────────────
  {
    patterns: [
      "qwertyhub",
      "qwerty hub",
      "what is qwertyhub",
      "marketplace",
      "browse products",
      "shop",
      "products",
    ],
    answer:
      "QwertyHub is the marketplace where you browse and buy products from verified suppliers. Go to QwertyHub (or Marketplace) to see products. You can add items to cart, resell products that allow it, or add products from QwertyHub to your own store (MyStore) to resell.",
  },

  // ─── ACBPayWallet – payments, topup, disbursement ──────────────────────
  {
    patterns: [
      "how to pay",
      "how do i pay",
      "payment",
      "pay for product",
      "checkout",
      "cart payment",
    ],
    answer:
      "At checkout you can pay with ACBPayWallet (wallet balance) or card. Add items to Cart, then go to Cart and click checkout. Top up your wallet at /wallet if you want to pay with wallet balance.",
  },
  {
    patterns: [
      "acbpaywallet",
      "acb pay wallet",
      "wallet",
      "top up",
      "topup",
      "add money",
      "add funds",
    ],
    answer:
      "ACBPayWallet is your in-app wallet. Go to /wallet to top up, view balance, and manage payments. You can top up with card or other payment methods. Use it to pay for products, errands, and donations.",
  },
  {
    patterns: [
      "disbursement",
      "payout",
      "withdraw",
      "get paid",
      "receive money",
      "runner payout",
    ],
    answer:
      "Runners receive payouts after tasks are completed. Admin approves disbursement from escrow to your wallet. Suppliers get paid when orders are fulfilled. Go to Wallet to see your balance and transaction history.",
  },
  {
    patterns: ["add card", "save card", "card payment", "pay with card"],
    answer:
      "Add a card at checkout or in your Wallet settings. Your card is stored securely for future payments. Go to /wallet to manage saved cards.",
  },
  {
    patterns: [
      "qr",
      "qr code",
      "scan qr",
      "pay with qr",
      "qr payment",
      "in-store payment",
    ],
    answer:
      "ACBPayWallet supports QR payments. In Wallet, view your QR code for in-store payments. Merchants scan your QR, you authorize with SMS code or wallet. Add your phone number in Wallet to use QR and request money.",
  },
  {
    patterns: [
      "request money",
      "request payment",
      "ask for money",
      "receive payment",
    ],
    answer:
      "In ACBPayWallet, use Request money to ask someone to pay you. They need your payer ID (from your QR). Add your phone number in Wallet to receive SMS/WhatsApp verification codes for QR and request-money flows.",
  },
  {
    patterns: ["donate", "donate to creator", "tip creator", "support creator"],
    answer:
      "On QwertyTV posts, tap the Donate button to send money to creators. Enter an amount and pay from your wallet. If your balance is low, use Top up & Donate. Donations go directly to the creator's wallet.",
  },

  // ─── Cart ────────────────────────────────────────────────────────────────
  {
    patterns: [
      "add to cart",
      "cart",
      "buy",
      "purchase",
      "checkout",
      "how to buy",
    ],
    answer:
      "Browse QwertyHub (Marketplace), click a product, and tap the cart icon to add it. Go to Cart to review and checkout. You can pay with ACBPayWallet or card.",
  },

  // ─── Morongwa (Messenger) ───────────────────────────────────────────────
  {
    patterns: [
      "morongwa",
      "messages",
      "messenger",
      "chat",
      "how to message",
      "contact seller",
      "product enquiry",
      "dm",
      "direct message",
      "conversation",
      "new chat",
    ],
    answer:
      "Morongwa is the messaging system. Use it to chat with other users, enquire about products, discuss tasks with runners, or start new conversations. Go to Morongwa to see your chats. Use 'Product enquiries' for questions about items, or 'Tasks' for errand-related messages.",
  },

  // ─── QwertyTV ────────────────────────────────────────────────────────────
  {
    patterns: [
      "qwertytv",
      "qwerty tv",
      "how to post",
      "create post",
      "upload video",
      "upload image",
      "go live",
      "live stream",
      "qwertz",
      "create qwertz",
      "genres",
      "hashtags",
    ],
    answer:
      "QwertyTV is for sharing videos, images, and going live. Click Create on QwertyTV or the Wall. Choose Video, Images, Create Qwertz (short videos), or Go live. Add a caption, genre, and hashtags. Content is moderated for community guidelines.",
  },
  {
    patterns: ["wall", "feed", "home feed", "main feed"],
    answer:
      "The Wall is your main feed. It shows posts from QwertyTV and people you follow. Go to /wall to see the latest content. Create posts from the Wall or QwertyTV.",
  },
  {
    patterns: ["live", "watch live", "live stream", "live broadcast"],
    answer:
      "QwertyTV has live streaming. Go to QwertyTV and choose Go live to broadcast, or visit /morongwa-tv/live to watch live streams from other creators.",
  },

  // ─── Verified to load music ─────────────────────────────────────────────
  {
    patterns: [
      "verified to load music",
      "artist verified",
      "upload song",
      "upload music",
      "add song",
      "artist verification",
      "become artist",
      "load music",
    ],
    answer:
      "You must be a verified artist to upload music. Apply at QwertyMusic (artist apply). Admin reviews and approves. Once verified, you can upload songs and albums. Listeners can browse and buy your music.",
  },

  // ─── Verified to load products (supplier) ────────────────────────────────
  {
    patterns: [
      "verified to load products",
      "verified supplier",
      "add products",
      "sell product",
      "list product",
      "supplier",
      "become supplier",
      "supplier apply",
      "load products",
    ],
    answer:
      "Only verified suppliers can add products. Apply at /supplier/apply with your store details and documents. Admin reviews and approves. Once approved, you get a supplier store and can add products from your supplier dashboard.",
  },

  // ─── Starting stores ────────────────────────────────────────────────────
  {
    patterns: [
      "how to register",
      "create store",
      "register store",
      "start store",
      "open store",
      "mystore",
      "my store",
      "reseller",
      "start selling",
      "resellers",
      "reseller store",
    ],
    answer:
      "Sign up first. For a supplier store: apply at /supplier/apply. For a reseller store: add products from QwertyHub to MyStore (resellers sell products from suppliers). Admin can also create stores. Go to your dashboard or QwertyHub to get started.",
  },

  // ─── Follow users ────────────────────────────────────────────────────────
  {
    patterns: [
      "how to follow",
      "follow user",
      "follow someone",
      "follow other users",
      "unfollow",
      "private account",
      "follow request",
    ],
    answer:
      "Visit a user's profile and click the Follow button. For public accounts you follow immediately. For private accounts, a follow request is sent and they can accept or reject. You can unfollow from their profile.",
  },

  // ─── Community guidelines ───────────────────────────────────────────────
  {
    patterns: [
      "community guidelines",
      "guidelines",
      "rules",
      "content policy",
      "what can i post",
      "prohibited",
      "report",
      "acceptable use",
    ],
    answer:
      "Qwertymates has community guidelines. No nudity, explicit content, violence, or harmful material. Images and videos are moderated. Report inappropriate content via the report option on posts. Go to /policies or /policies/acceptable-use for full terms.",
  },

  // ─── QwertyMusic & buying songs ──────────────────────────────────────────
  {
    patterns: [
      "qwerty music",
      "qwertymusic",
      "music",
      "listen to music",
      "artists",
    ],
    answer:
      "QwertyMusic is where you browse and listen to music from verified artists. Go to QwertyMusic in the sidebar. You can buy songs, add them to cart, and download after purchase. Artists must be verified to upload.",
  },
  {
    patterns: [
      "buy song",
      "buying songs",
      "purchase song",
      "download song",
      "buy music",
    ],
    answer:
      "Browse QwertyMusic to find songs. Artists can enable purchase/download. Add to cart and checkout, or buy directly. Once purchased, you can download from your purchases. Go to QwertyMusic to browse.",
  },

  // ─── Errands ────────────────────────────────────────────────────────────
  {
    patterns: [
      "errand",
      "request errand",
      "create task",
      "hire runner",
      "runner",
      "task",
    ],
    answer:
      "Go to Errands and create a task. Describe what you need, set the budget, and runners can accept. Payment goes to escrow and is released when the task is completed. Runners must be verified.",
  },

  // ─── Search & keywords ───────────────────────────────────────────────────
  {
    patterns: [
      "search",
      "find",
      "look for",
      "where is",
      "how to find",
      "keywords",
      "what to type",
      "what should i search",
      "guide me",
    ],
    answer:
      "Use the search bar (Ask MacGyver) or go to /search. Type keywords for products, users, TV posts, or music. Try: product names (e.g. 'running shoes'), usernames, hashtags, or artist names. Search finds matches across QwertyHub, QwertyTV, QwertyMusic, and users. Ask MacGyver for help with specific topics.",
  },

  // ─── Profile & account ──────────────────────────────────────────────────
  {
    patterns: [
      "profile",
      "edit profile",
      "profile picture",
      "avatar",
      "update profile",
    ],
    answer:
      "Click your profile icon (top right) and choose Profile. You can update your name, avatar, and other details. Add a phone number for wallet verification and SMS codes.",
  },

  // ─── MacGyver (meta) ─────────────────────────────────────────────────────
  {
    patterns: ["who is macgyver", "what is macgyver", "ask macgyver"],
    answer:
      "MacGyver is your Qwertymates assistant – Mr Know-it-all, Mr Fix-it-all. Ask about QwertyHub, Morongwa, QwertyTV, ACBPayWallet, stores, errands, music, or anything on the platform. I answer from the knowledge base first, then general questions when configured.",
  },

  // ─── About Qwertymates ──────────────────────────────────────────────────
  {
    patterns: [
      "what is qwertymates",
      "about qwertymates",
      "how does qwertymates work",
    ],
    answer:
      "Qwertymates is a platform for errands, marketplace (QwertyHub), TV content (QwertyTV), music (QwertyMusic), and messaging (Morongwa). Buy products, hire runners for tasks, post videos, sell as supplier or reseller, and chat with others. ACBPayWallet handles payments.",
  },

  // ─── Pricing & support ──────────────────────────────────────────────────
  {
    patterns: ["pricing", "fees", "cost", "how much"],
    answer:
      "Check the Pricing page for task fees, marketplace commissions, and payment costs. Fees vary by service. Go to Pricing in the sidebar for details.",
  },
  {
    patterns: ["support", "help", "contact", "problem", "issue"],
    answer:
      "Go to Support in the sidebar to create a ticket. For urgent issues, check the Policies page or contact support. MacGyver can also help with platform questions.",
  },

  // ─── Policies ───────────────────────────────────────────────────────────
  {
    patterns: ["policies", "terms", "privacy", "policy", "legal"],
    answer:
      "Qwertymates has policies at /policies: Terms of Service, Privacy Policy, Cookies, Pricing Fees & Commissions (tasks vs QwertyHub), Escrow & Payouts, Community Guidelines (Acceptable Use), and more. Go to Policies in the sidebar.",
  },
];

/**
 * Find a matching FAQ for the query. Returns the answer if any pattern matches, else null.
 */
export function findQwertymatesAnswer(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  for (const faq of QWERTYMATES_FAQS) {
    for (const pattern of faq.patterns) {
      if (q.includes(pattern.toLowerCase())) {
        return faq.answer;
      }
    }
  }
  return null;
}

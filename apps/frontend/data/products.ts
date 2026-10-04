import {
  Activity,
  Bot,
  Clock,
  Code2,
  Cpu,
  Gamepad2,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  Network,
  RefreshCw,
  ScrollText,
  Shield,
  ShieldCheck,
  Timer,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type ProductSlug = 'discord-bots' | 'game-servers' | 'nodejs' | 'apis' | 'workers' | 'websites';

export interface ProductPlan {
  name: string;
  price: number;
  specs: string[];
  popular?: boolean;
}

export interface Product {
  slug: ProductSlug;
  name: string;
  short: string;
  icon: LucideIcon;
  category: 'Bots & Apps' | 'Gaming' | 'Web';
  badge?: string;
  accent: { text: string; bg: string; ring: string; hex: string };
  headline: [string, string];
  description: string;
  stats: { value: string; label: string }[];
  stack: string[];
  highlights: { icon: LucideIcon; title: string; body: string }[];
  code: { title: string; lang: string; content: string };
  plans: ProductPlan[];
  faq: [string, string][];
  docs: string;
}

const primary = { text: 'text-brand-300', bg: 'bg-brand-500/10', ring: 'ring-brand-500/25', hex: '#2563FF' };
const secondary = { text: 'text-azure-400', bg: 'bg-azure-500/10', ring: 'ring-azure-500/25', hex: '#12A8F0' };
const accent = { text: 'text-aqua-400', bg: 'bg-aqua-500/10', ring: 'ring-aqua-500/25', hex: '#4FE3D3' };
const green = { text: 'text-success-400', bg: 'bg-success-500/10', ring: 'ring-success-500/25', hex: '#22C55E' };

const BOT_PLANS: ProductPlan[] = [
  { name: 'Bot Free', price: 0, specs: ['1 bot', '256 MB RAM', '0.25 vCPU', 'Community support'] },
  { name: 'Bot Starter', price: 1.99, specs: ['2 bots', '512 MB RAM', '0.5 vCPU', 'Automatic restarts'] },
  { name: 'Bot Pro', price: 3.99, specs: ['5 bots', '1 GB RAM', '1 vCPU', 'Git deploys & Lavalink-ready'], popular: true },
  { name: 'Bot Ultra', price: 7.99, specs: ['Unlimited bots', '2 GB RAM', '2 vCPU', 'Priority support'] },
];

const NODE_PLANS: ProductPlan[] = [
  { name: 'Hobby', price: 0, specs: ['1 app', '512 MB RAM', '0.25 vCPU', '1 GB storage'] },
  { name: 'Starter', price: 2.99, specs: ['3 apps', '1 GB RAM', '0.5 vCPU', '5 GB storage'] },
  { name: 'Pro', price: 6.99, specs: ['10 apps', '2 GB RAM', '1 vCPU', '15 GB storage & custom domains'], popular: true },
  { name: 'Scale', price: 14.99, specs: ['Unlimited apps', '4 GB RAM', '2 vCPU', '30 GB storage'] },
];

const API_PLANS: ProductPlan[] = [
  { name: 'Hobby', price: 0, specs: ['1 API', '512 MB RAM', 'Shared HTTPS URL', '100k requests/month'] },
  { name: 'Launch', price: 3.99, specs: ['3 APIs', '1 GB RAM', 'Custom domain', 'Unlimited requests'] },
  { name: 'Growth', price: 8.99, specs: ['10 APIs', '2 GB RAM', '2 instances with load balancing', 'Health checks & alerts'], popular: true },
  { name: 'Scale', price: 19.99, specs: ['Unlimited APIs', '4 GB RAM', 'Up to 4 instances', 'Priority support'] },
];

const WORKER_PLANS: ProductPlan[] = [
  { name: 'Free', price: 0, specs: ['1 worker', '256 MB RAM', 'Up to 3 cron jobs', 'Community support'] },
  { name: 'Worker', price: 2.49, specs: ['3 workers', '512 MB RAM', 'Unlimited cron jobs', 'Automatic restarts'] },
  { name: 'Worker Pro', price: 5.99, specs: ['10 workers', '1.5 GB RAM', '1 vCPU', 'Failure alerts'], popular: true },
  { name: 'Worker Max', price: 12.99, specs: ['Unlimited workers', '4 GB RAM', '2 vCPU', 'Priority support'] },
];

const WEB_PLANS: ProductPlan[] = [
  { name: 'Static', price: 0, specs: ['1 static site', 'Free HTTPS', '1 GB bandwidth/day', 'digitaly.app subdomain'] },
  { name: 'Site', price: 1.49, specs: ['3 sites', 'Custom domain', 'Unmetered bandwidth', 'Daily backups'] },
  { name: 'Site Pro', price: 3.99, specs: ['10 sites', 'Server-rendered apps', '1 GB RAM', 'Preview deployments'], popular: true },
  { name: 'Agency', price: 9.99, specs: ['Unlimited sites', '2 GB RAM', 'Team access', 'Priority support'] },
];

export const PRODUCTS: Product[] = [
  {
    slug: 'discord-bots',
    name: 'Discord Bot Hosting',
    short: 'Keep your bot online 24/7',
    icon: Bot,
    category: 'Bots & Apps',
    accent: primary,
    headline: ['Your Discord bot,', 'online 24/7.'],
    description: 'Host discord.js, Sapphire, Eris or discord.py bots on dedicated French infrastructure. Push your code, add your token, and we keep it running.',
    stats: [
      { value: '38 ms', label: 'Median gateway latency' },
      { value: '< 45 s', label: 'From push to online' },
      { value: '99.98%', label: 'Uptime last 90 days' },
    ],
    stack: ['discord.js', 'Sapphire', 'Eris', 'discord.py', 'Oceanic', 'Lavalink'],
    highlights: [
      { icon: RefreshCw, title: 'Automatic restarts', body: 'If your bot crashes, we bring it back in seconds and notify you.' },
      { icon: KeyRound, title: 'Secure token storage', body: 'DISCORD_TOKEN is encrypted at rest and never shown in logs.' },
      { icon: ScrollText, title: 'Live logs', body: 'Follow commands, gateway events and errors in real time.' },
      { icon: GitBranch, title: 'Deploy on push', body: 'Connect GitHub and every push to main ships a new version.' },
      { icon: Gauge, title: 'Low latency to Discord', body: 'Peered European network for fast interaction responses.' },
      { icon: Users, title: 'Sharding ready', body: 'Scale to thousands of guilds with more RAM in one click.' },
    ],
    code: {
      title: 'index.js',
      lang: 'js',
      content: `import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(\`Logged in as \${client.user.tag}\`);
});

client.login(process.env.DISCORD_TOKEN);`,
    },
    plans: BOT_PLANS,
    faq: [
      ['Does my bot really stay online for free?', 'Yes. The Bot Free plan keeps one bot running 24/7 with 256 MB RAM, enough for most small community bots.'],
      ['Can I use Python?', 'Yes. Choose the Python runtime or bring a Dockerfile, and set your start command.'],
      ['Can I play music with Lavalink?', 'Yes. Run Lavalink as a second service on Bot Pro or Bot Ultra and connect it over the private network.'],
    ],
    docs: 'discord-bots',
  },
  {
    slug: 'game-servers',
    name: 'Game Servers',
    short: 'Minecraft, FiveM, Rust and more',
    icon: Gamepad2,
    category: 'Gaming',
    badge: 'New',
    accent: accent,
    headline: ['Game servers', 'without the lag.'],
    description: 'Launch Minecraft, FiveM, Rust, Palworld or Valheim servers on high-frequency CPUs with NVMe storage and built-in DDoS protection, hosted in France.',
    stats: [
      { value: '5.0 GHz', label: 'High-frequency CPUs' },
      { value: '< 60 s', label: 'Server ready' },
      { value: '1.2 Tbps', label: 'DDoS mitigation' },
    ],
    stack: ['Minecraft Java', 'Bedrock', 'FiveM', 'Rust', 'Palworld', 'Valheim', 'ARK', 'Terraria'],
    highlights: [
      { icon: Zap, title: 'High-frequency CPUs', body: 'Single-thread performance tuned for game ticks, not shared cloud cores.' },
      { icon: Shield, title: 'DDoS protection', body: 'Always-on filtering tuned for game protocols, included in every plan.' },
      { icon: HardDrive, title: 'NVMe storage', body: 'Fast world loading and chunk generation with daily snapshots.' },
      { icon: Layers, title: 'One-click mods', body: 'Install Paper, Forge, Fabric, modpacks and plugins from the dashboard.' },
      { icon: Clock, title: 'Automatic backups', body: 'Daily backups kept for 7 days. Restore any world in one click.' },
      { icon: Users, title: 'Shared access', body: 'Give your moderators console and file access without sharing passwords.' },
    ],
    code: {
      title: 'server.properties',
      lang: 'ini',
      content: `motd=\\u00a7dDIGITALY \\u00a77Community SMP
max-players=60
view-distance=12
simulation-distance=10
online-mode=true
enable-command-block=false
# Edited from the DIGITALYCloud file manager`,
    },
    plans: [
      { name: 'Pebble', price: 3.99, specs: ['2 GB RAM', '2 vCPU @ 5.0 GHz', '20 GB NVMe', 'Up to 10 players'] },
      { name: 'Stone', price: 7.99, specs: ['4 GB RAM', '3 vCPU @ 5.0 GHz', '40 GB NVMe', 'Up to 30 players'], popular: true },
      { name: 'Diamond', price: 14.99, specs: ['8 GB RAM', '4 vCPU @ 5.0 GHz', '80 GB NVMe', 'Up to 80 players'] },
      { name: 'Netherite', price: 27.99, specs: ['16 GB RAM', '6 vCPU @ 5.0 GHz', '160 GB NVMe', 'Large modpacks'] },
    ],
    faq: [
      ['Which games are supported?', 'Minecraft Java and Bedrock, FiveM, Rust, Palworld, Valheim, ARK and Terraria today, with more coming every month.'],
      ['Can I install modpacks?', 'Yes. Forge, Fabric, NeoForge and CurseForge modpacks install in one click from the dashboard.'],
      ['Is DDoS protection extra?', 'No. Always-on DDoS mitigation is included with every game server.'],
    ],
    docs: 'getting-started',
  },
  {
    slug: 'nodejs',
    name: 'Node.js Hosting',
    short: 'Any framework, any version',
    icon: Code2,
    category: 'Bots & Apps',
    accent: green,
    headline: ['Node.js apps,', 'deployed in seconds.'],
    description: 'Run Next.js, Nuxt, Express, NestJS or any Node.js process. Pick your version, bring your start command, and get a public HTTPS URL.',
    stats: [
      { value: 'Node 18–22', label: 'LTS versions' },
      { value: '< 60 s', label: 'Average build' },
      { value: 'HTTPS', label: 'Certificates included' },
    ],
    stack: ['Next.js', 'Nuxt', 'NestJS', 'Express', 'Remix', 'Astro SSR', 'Bun', 'pnpm'],
    highlights: [
      { icon: GitBranch, title: 'Git deployments', body: 'Every push builds and ships automatically, with instant rollbacks.' },
      { icon: Lock, title: 'Free HTTPS', body: 'Certificates are issued and renewed for every service and custom domain.' },
      { icon: Activity, title: 'Live metrics', body: 'CPU, memory and network graphs for every service, updated live.' },
      { icon: KeyRound, title: 'Environment variables', body: 'Secrets are encrypted and injected only at runtime.' },
      { icon: Timer, title: 'Zero-downtime deploys', body: 'The new version only takes traffic after its health check passes.' },
      { icon: ScrollText, title: 'Searchable logs', body: 'Filter by level, search, pause and download your logs.' },
    ],
    code: {
      title: 'package.json',
      lang: 'json',
      content: `{
  "name": "community-dashboard",
  "engines": { "node": "22.x" },
  "scripts": {
    "build": "next build",
    "start": "next start -p $PORT"
  }
}`,
    },
    plans: NODE_PLANS,
    faq: [
      ['Which Node.js versions are available?', 'Node.js 18, 20 and 22 LTS. Set it in package.json engines or in your service settings.'],
      ['Can I use a custom domain?', 'Yes, on every paid plan. HTTPS is configured automatically.'],
      ['Do you support pnpm, yarn and Bun?', 'Yes. We detect your lockfile and use the matching package manager.'],
    ],
    docs: 'nodejs',
  },
  {
    slug: 'apis',
    name: 'API Hosting',
    short: 'Fast APIs with a public URL',
    icon: Network,
    category: 'Web',
    accent: secondary,
    headline: ['APIs that', 'just stay up.'],
    description: 'Ship REST, GraphQL or webhook APIs with Express, Fastify or Hono. Health checks, HTTPS and request metrics are built in.',
    stats: [
      { value: '42 ms', label: 'p50 response time' },
      { value: '10 Gbps', label: 'Network per server' },
      { value: 'EU', label: 'Data stays in Europe' },
    ],
    stack: ['Express', 'Fastify', 'Hono', 'NestJS', 'tRPC', 'GraphQL Yoga', 'Elysia'],
    highlights: [
      { icon: Activity, title: 'Health checks', body: 'We probe your endpoint and restart the service if it stops responding.' },
      { icon: Webhook, title: 'Webhook friendly', body: 'Stable public URLs for Stripe, GitHub or Discord webhooks.' },
      { icon: Gauge, title: 'Request metrics', body: 'Requests per minute, latency and error rate on every service.' },
      { icon: Lock, title: 'Free HTTPS', body: 'TLS everywhere, including custom domains.' },
      { icon: ShieldCheck, title: 'Data residency', body: 'Your API and its data stay in the region you choose, with EU regions on every plan.' },
      { icon: Timer, title: 'Zero-downtime deploys', body: 'Traffic only switches once the new version is healthy.' },
    ],
    code: {
      title: 'server.ts',
      lang: 'ts',
      content: `import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();
app.get('/health', (c) => c.json({ ok: true }));
app.get('/members', (c) => c.json(members));

serve({ fetch: app.fetch, port: Number(process.env.PORT) });`,
    },
    plans: API_PLANS,
    faq: [
      ['Which port should my API listen on?', 'Read the PORT environment variable. We route HTTPS traffic to it automatically.'],
      ['Can I connect a database?', 'Yes. Store your DATABASE_URL as an environment variable and connect to any provider.'],
      ['Is there rate limiting?', 'Fair-use limits protect the platform. Your own rate limiting stays fully in your control.'],
    ],
    docs: 'api',
  },
  {
    slug: 'workers',
    name: 'Background Workers',
    short: 'Queues, cron jobs and scripts',
    icon: Cpu,
    category: 'Bots & Apps',
    accent: primary,
    headline: ['Background work,', 'handled.'],
    description: 'Run queue consumers, scheduled jobs and long-running scripts without exposing a port. Perfect for notifiers, scrapers and sync tasks.',
    stats: [
      { value: '1 min', label: 'Cron precision' },
      { value: 'Unlimited', label: 'Run duration' },
      { value: 'Auto', label: 'Crash recovery' },
    ],
    stack: ['BullMQ', 'node-cron', 'Agenda', 'RabbitMQ', 'Redis', 'Python'],
    highlights: [
      { icon: Clock, title: 'Scheduled jobs', body: 'Cron expressions with minute precision and run history.' },
      { icon: RefreshCw, title: 'Crash recovery', body: 'Workers restart automatically and resume from your queue.' },
      { icon: ScrollText, title: 'Run logs', body: 'Every run is logged, searchable and downloadable.' },
      { icon: KeyRound, title: 'Secrets', body: 'API keys and tokens injected securely at runtime.' },
      { icon: Activity, title: 'Resource graphs', body: 'Watch CPU and memory to right-size your worker.' },
      { icon: Zap, title: 'No port needed', body: 'Workers run privately with no public exposure.' },
    ],
    code: {
      title: 'worker.js',
      lang: 'js',
      content: `import cron from 'node-cron';
import { notifyNewVideos } from './notify.js';

cron.schedule('*/5 * * * *', async () => {
  const sent = await notifyNewVideos();
  console.log(\`Sent \${sent} notifications\`);
});`,
    },
    plans: WORKER_PLANS,
    faq: [
      ['Is there a time limit on jobs?', 'No. Workers are long-running processes, not functions with timeouts.'],
      ['Can a worker talk to my other services?', 'Yes, over the private network between services on the same account.'],
      ['Can I trigger a job manually?', 'Yes. Restart the worker or run a one-off command from the dashboard.'],
    ],
    docs: 'creating-a-service',
  },
  {
    slug: 'websites',
    name: 'Website Hosting',
    short: 'Sites and portfolios from France',
    icon: Globe,
    category: 'Web',
    accent: accent,
    headline: ['Websites,', 'fast from France.'],
    description: 'Host landing pages, portfolios, documentation and dashboards with free HTTPS, custom domains and instant cache purges.',
    stats: [
      { value: '< 30 s', label: 'Deploy time' },
      { value: 'Free', label: 'SSL certificates' },
      { value: '100', label: 'Typical Lighthouse score' },
    ],
    stack: ['Vite', 'Astro', 'Next.js export', 'Hugo', 'Eleventy', 'Plain HTML'],
    highlights: [
      { icon: Globe, title: 'Custom domains', body: 'Point your domain and we handle DNS checks and certificates.' },
      { icon: Zap, title: 'Fast by default', body: 'Compressed, cached assets served from NVMe in the region closest to your visitors.' },
      { icon: GitBranch, title: 'Preview deploys', body: 'Every branch gets its own preview URL on Pro and above.' },
      { icon: Lock, title: 'Free HTTPS', body: 'Certificates issued and renewed automatically.' },
      { icon: RefreshCw, title: 'Instant rollbacks', body: 'Go back to any previous version in one click.' },
      { icon: ShieldCheck, title: 'GDPR friendly', body: 'No third-party trackers, EU hosting by default.' },
    ],
    code: {
      title: 'Terminal',
      lang: 'bash',
      content: `$ npm run build
✓ built in 2.1s
$ git push origin main
→ DIGITALYCloud: deploying portfolio...
✓ Live at https://portfolio.digitaly.app`,
    },
    plans: WEB_PLANS,
    faq: [
      ['Can I host a static site for free?', 'Yes. Static sites run on the Static plan with a digitaly.app subdomain.'],
      ['Do you support server-side rendering?', 'Yes. Deploy it as a Node.js service and we route traffic to it.'],
      ['How do custom domains work?', 'Add your domain, create the DNS record we show you, and HTTPS is ready within minutes.'],
    ],
    docs: 'getting-started',
  },
];

export const getProduct = (slug: string | undefined) => PRODUCTS.find((p) => p.slug === slug);

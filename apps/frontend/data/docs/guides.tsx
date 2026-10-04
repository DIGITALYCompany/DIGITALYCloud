import type { DocArticle } from './types';
import { B, C, Callout, Checklist, CodeBlock, H2, MockServiceCard, MockSourcePicker, P, Steps, Table, UL } from './primitives';

export const GUIDE_DOCS: DocArticle[] = [
  {
    slug: 'getting-started',
    section: 'Introduction',
    title: 'Getting Started',
    summary: 'Learn the basics of DIGITALYCloud and deploy in minutes.',
    minutes: 3,
    body: (
      <>
        <P>DIGITALYCloud runs your code on servers operated by DIGITALY, from our home regions in France to Europe, North America and Asia Pacific. You never need to SSH into a machine, configure a firewall or install Node.js yourself: you push code, we keep it running.</P>
        <H2 id="concepts">Core concepts</H2>
        <UL
          items={[
            <><B>Service</B> — a running application: a Discord bot, a web API, a background worker.</>,
            <><B>Deployment</B> — one version of your code that was built and started. Every service keeps its deployment history.</>,
            <><B>Plan</B> — the resources (RAM, CPU, storage) assigned to a service. You can change it at any time.</>,
            <><B>Environment variables</B> — encrypted settings and secrets injected into your service when it starts.</>,
          ]}
        />
        <H2 id="workflow">The workflow</H2>
        <Steps
          items={[
            { title: 'Create a service', body: 'Pick what you want to run and connect your code from GitHub, a .zip upload or a Docker image.' },
            { title: 'Configure it', body: 'Set the start command and add your secrets. When you choose a plan, pick a region: Free covers France, Starter adds Europe, Pro adds North America and Business unlocks every region.' },
            { title: 'Deploy', body: 'We install dependencies, start your process and verify it stays healthy.' },
            { title: 'Monitor', body: 'Watch live CPU, memory and logs from the dashboard, and get alerted when something goes wrong.' },
          ]}
        />
        <MockServiceCard />
        <Callout kind="tip">New here? Start with the Discord bot guide — it works on the Free plan and takes about five minutes.</Callout>
      </>
    ),
  },
  {
    slug: 'creating-a-service',
    section: 'Introduction',
    title: 'Creating a Service',
    summary: 'Use the five-step wizard to launch any workload.',
    minutes: 3,
    body: (
      <>
        <P>Open <C>Services → New Service</C>. The wizard asks what you want to deploy, where your code lives, how to start it, and how much power it needs.</P>
        <H2 id="source">Choose a source</H2>
        <MockSourcePicker />
        <Table
          head={['Source', 'Best for', 'Updates']}
          rows={[
            ['GitHub', 'Projects under version control', 'Automatic on every push to the selected branch'],
            ['Upload files', 'Quick tests, small scripts', 'Upload a new archive and redeploy'],
            ['Docker image', 'Custom runtimes, any language', 'Redeploy to pull the latest tag'],
          ]}
        />
        <H2 id="start">Start command</H2>
        <P>We detect common setups automatically. If your project has a <C>start</C> script in <C>package.json</C>, it is used by default. Otherwise, enter the command manually, for example <C>node src/index.js</C>.</P>
        <Callout kind="tip">You can change the plan of a service later without redeploying.</Callout>
      </>
    ),
  },
  {
    slug: 'discord-bots',
    section: 'Guides',
    title: 'Deploy your first Discord bot',
    summary: 'From an empty folder to a bot that is online 24/7.',
    minutes: 6,
    featured: true,
    body: (
      <>
        <P>This guide walks you through hosting a discord.js bot on DIGITALYCloud. It takes about five minutes and works on the Free plan.</P>
        <H2 id="prerequisites">1. Prerequisites</H2>
        <P>You need a bot token from the Discord Developer Portal and a project with a <C>package.json</C>.</P>
        <CodeBlock
          title="index.js"
          lang="js"
          code={`import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(\`Logged in as \${client.user.tag}\`);
});

client.login(process.env.DISCORD_TOKEN);`}
        />
        <CodeBlock
          title="package.json"
          lang="json"
          code={`{
  "name": "syncbot",
  "type": "module",
  "scripts": { "start": "node index.js" },
  "dependencies": { "discord.js": "^14.16.0" }
}`}
        />
        <Callout kind="warning">Never commit your bot token. Store it as an environment variable instead.</Callout>
        <H2 id="create">2. Create the service</H2>
        <P>In the dashboard, click <C>+ New Service</C>, choose <C>Discord Bot</C>, then connect your GitHub repository.</P>
        <MockSourcePicker />
        <H2 id="env">3. Add your token</H2>
        <P>In the configuration step, add an environment variable named <C>DISCORD_TOKEN</C>. It is encrypted and only injected at runtime.</P>
        <H2 id="deploy">4. Deploy</H2>
        <P>Click <C>Deploy Service</C>. DIGITALYCloud installs dependencies, runs <C>npm start</C> and checks that the process stays alive.</P>
        <CodeBlock
          title="Deployment logs"
          lang="text"
          code={`[21:14:02] Starting SyncBot...
[21:14:03] Loading environment variables...
[21:14:04] Connecting to Discord...
[21:14:05] Logged in successfully
[21:14:05] Bot is now online`}
        />
        <MockServiceCard />
        <Callout kind="tip">Enable automatic deploys to ship every push to <C>main</C> without opening the dashboard.</Callout>
      </>
    ),
  },
  {
    slug: 'nodejs',
    section: 'Guides',
    title: 'Node.js apps',
    summary: 'Runtimes, start commands, ports and package managers.',
    minutes: 4,
    body: (
      <>
        <P>DIGITALYCloud supports Node.js 18, 20 LTS and 22 LTS. We recommend the latest LTS for new projects.</P>
        <H2 id="version">Pin your Node version</H2>
        <P>Add an <C>engines</C> field so every deployment uses the same runtime as your machine.</P>
        <CodeBlock lang="json" title="package.json" code={`{\n  "engines": { "node": "22.x" },\n  "scripts": { "start": "node server.js" }\n}`} />
        <H2 id="port">Listen on the right port</H2>
        <P>Web apps must listen on the port provided in <C>process.env.PORT</C>. Hard-coding a port is the most common reason for a failed health check.</P>
        <CodeBlock
          lang="js"
          title="server.js"
          code={`import express from 'express';
const app = express();
app.get('/health', (_, res) => res.send('ok'));
app.listen(process.env.PORT ?? 3000);`}
        />
        <H2 id="package-managers">Package managers</H2>
        <P>We detect your package manager from the lockfile: <C>package-lock.json</C> (npm), <C>pnpm-lock.yaml</C> (pnpm) or <C>yarn.lock</C> (Yarn). Always commit your lockfile for reproducible installs.</P>
      </>
    ),
  },
  {
    slug: 'workers',
    section: 'Guides',
    title: 'Workers & scheduled jobs',
    summary: 'Run background tasks, queue consumers and cron jobs.',
    minutes: 4,
    body: (
      <>
        <P>Workers are services without a public URL. They are perfect for processing queues, sending emails, syncing data or running tasks on a schedule.</P>
        <H2 id="long-running">Long-running workers</H2>
        <P>A worker is simply a process that never exits. If it crashes, DIGITALYCloud restarts it automatically.</P>
        <CodeBlock
          lang="js"
          title="worker.js"
          code={`async function loop() {
  while (true) {
    const job = await queue.next();
    if (job) await handle(job);
    else await new Promise((r) => setTimeout(r, 2000));
  }
}
loop();`}
        />
        <H2 id="cron">Scheduled jobs</H2>
        <P>For tasks that run on a schedule, add a cron expression in the service settings. Your command runs, finishes, and the container stops until the next run.</P>
        <Table
          head={['Expression', 'Runs']}
          rows={[
            [<C key="a">*/15 * * * *</C>, 'Every 15 minutes'],
            [<C key="b">0 3 * * *</C>, 'Every day at 03:00 (Europe/Paris)'],
            [<C key="c">0 9 * * 1</C>, 'Every Monday at 09:00'],
          ]}
        />
        <Checklist
          title="Before you schedule a job"
          items={['Make sure the job can safely run twice (for example after a retry).', 'Exit with a non-zero code on failure so it shows as failed.', 'Log a short summary at the end of each run.']}
        />
      </>
    ),
  },
];

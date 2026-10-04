import type { DocArticle } from './types';
import { B, C, Callout, Checklist, CodeBlock, DoDont, H2, P, Table, UL } from './primitives';

export const BEST_PRACTICE_DOCS: DocArticle[] = [
  {
    slug: 'choosing-a-plan',
    section: 'Best practices',
    title: 'Choosing the right plan',
    summary: 'How to size RAM and CPU without overpaying.',
    minutes: 5,
    featured: true,
    body: (
      <>
        <P>Most projects need far less than people expect. The right approach is to start small, measure for a few days, then adjust. Changing plan takes seconds and never requires a redeploy.</P>
        <H2 id="typical">Typical needs</H2>
        <Table
          head={['Project', 'Usual memory', 'Suggested start']}
          rows={[
            ['Small Discord bot (1–50 servers)', '80–200 MB', 'Free or Starter'],
            ['Discord bot with music / Lavalink', '400 MB – 1 GB', 'Pro'],
            ['Small REST API', '100–300 MB', 'Hobby or Launch'],
            ['API with heavy traffic', '500 MB – 2 GB', 'Growth, with 2 instances'],
            ['Queue worker / cron jobs', '100–400 MB', 'Free or Worker'],
          ]}
        />
        <H2 id="signals">Signs you should upgrade</H2>
        <UL
          items={[
            <>Memory stays above <B>80%</B> of your limit for long periods.</>,
            <>Your service is restarted with an <C>Out of memory</C> message in the logs.</>,
            <>CPU is pinned at <B>100%</B> and response times climb.</>,
            <>You need a feature only available on higher plans, such as custom domains or multiple instances.</>,
          ]}
        />
        <H2 id="signals-down">Signs you can downgrade</H2>
        <P>If memory stays under 40% and CPU under 20% for a week, you are very likely on a plan that is too large. Drop one level and keep an eye on the Metrics tab.</P>
        <Callout kind="tip">Check the Metrics tab over a full week before deciding. Weekend and evening traffic often looks very different from a Tuesday morning.</Callout>
      </>
    ),
  },
  {
    slug: 'keep-your-bot-online',
    section: 'Best practices',
    title: 'Keeping your bot online 24/7',
    summary: 'Handle crashes, reconnects and restarts gracefully.',
    minutes: 6,
    featured: true,
    body: (
      <>
        <P>DIGITALYCloud restarts your process automatically when it crashes, but the best bots rarely crash in the first place. These habits will keep yours stable.</P>
        <H2 id="errors">Never let an error kill the process</H2>
        <P>An unhandled promise rejection stops Node.js. Log it instead, so you can fix the cause without losing uptime.</P>
        <CodeBlock
          lang="js"
          title="index.js"
          code={`process.on('unhandledRejection', (err) => {
  console.error('ERROR unhandled rejection', err);
});

client.on('error', (err) => console.error('ERROR client', err));
client.on('shardDisconnect', () => console.warn('WARN shard disconnected, reconnecting'));`}
        />
        <H2 id="shutdown">Shut down cleanly</H2>
        <P>When you deploy or restart, we send a <C>SIGTERM</C> signal and wait up to 10 seconds. Use that time to close connections and save state.</P>
        <CodeBlock
          lang="js"
          code={`process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await db.close();
  client.destroy();
  process.exit(0);
});`}
        />
        <H2 id="rate-limits">Respect rate limits</H2>
        <P>Sending too many requests to Discord gets your bot temporarily blocked. Batch updates, avoid editing the same message in a loop and let the library queue requests for you.</P>
        <Checklist
          title="Stability checklist"
          items={[
            'Errors are caught and logged, never thrown at the top level.',
            'The bot handles SIGTERM and closes its connections.',
            'Only the intents you really use are enabled.',
            'Long tasks run in the background instead of blocking commands.',
            'You have tested a restart and the bot comes back on its own.',
          ]}
        />
      </>
    ),
  },
  {
    slug: 'securing-your-service',
    section: 'Best practices',
    title: 'Securing your service',
    summary: 'Protect your tokens, your account and your users.',
    minutes: 5,
    featured: true,
    body: (
      <>
        <P>A leaked token is the number one cause of compromised bots and APIs. Most incidents are avoidable with a few simple rules.</P>
        <DoDont
          dos={[
            'Store every secret as an environment variable.',
            'Rotate a token immediately if you think it leaked.',
            'Enable two-factor authentication on your DIGITALYCloud and GitHub accounts.',
            'Create one API key per tool, with a clear name.',
            'Update dependencies regularly.',
          ]}
          donts={[
            'Commit .env files or paste tokens in your code.',
            'Share your account password with teammates — invite them instead.',
            'Print secrets in logs, even temporarily.',
            'Reuse the same API key across every script.',
            'Ignore security warnings from your package manager.',
          ]}
        />
        <H2 id="leak">If a token leaks</H2>
        <UL
          items={[
            <>Regenerate it at the source (Discord Developer Portal, Stripe, etc.).</>,
            <>Update the variable in <C>Environment</C>; the service restarts with the new value.</>,
            <>Remove it from your Git history — deleting the file in a new commit is not enough.</>,
            <>Review recent activity in your logs for anything unusual.</>,
          ]}
        />
        <H2 id="deps">Keep dependencies healthy</H2>
        <CodeBlock lang="bash" code={`npm audit\nnpm outdated\nnpm update`} />
        <Callout kind="warning">GitHub scans public repositories for leaked tokens within minutes. Assume anything pushed publicly is compromised.</Callout>
      </>
    ),
  },
  {
    slug: 'zero-downtime-deploys',
    section: 'Best practices',
    title: 'Deploying without downtime',
    summary: 'Health checks, branches and safe releases.',
    minutes: 4,
    body: (
      <>
        <P>DIGITALYCloud only switches to a new version once it passes its health check. Help it decide correctly and your users will never see an interruption.</P>
        <H2 id="health">Add a real health endpoint</H2>
        <P>A good health check confirms your app can do its job, not just that the process is alive.</P>
        <CodeBlock
          lang="js"
          code={`app.get('/health', async (_, res) => {
  try {
    await db.query('select 1');
    res.status(200).send('ok');
  } catch {
    res.status(503).send('database unavailable');
  }
});`}
        />
        <H2 id="branches">Use a branch workflow</H2>
        <UL
          items={[
            <>Develop on a feature branch, merge to <C>main</C> only when it works locally.</>,
            <>Create a second service connected to a <C>staging</C> branch to test changes on real infrastructure.</>,
            <>Avoid deploying on Friday evening — if something breaks, you want to be around.</>,
          ]}
        />
        <H2 id="migrations">Database changes</H2>
        <P>Make changes in two steps: first add new columns or tables that the old version ignores, deploy, then remove what is no longer used in a later release. This keeps a rollback possible at every step.</P>
      </>
    ),
  },
  {
    slug: 'reduce-memory',
    section: 'Best practices',
    title: 'Reducing memory usage',
    summary: 'Simple fixes that often halve your RAM.',
    minutes: 4,
    body: (
      <>
        <P>Lower memory means a cheaper plan and fewer out-of-memory restarts. These are the fixes that make the biggest difference.</P>
        <H2 id="cache">Limit caches</H2>
        <P>discord.js caches every member and message by default. On large servers this grows quickly. Restrict what is cached:</P>
        <CodeBlock
          lang="js"
          code={`import { Client, Options } from 'discord.js';

const client = new Client({
  intents: [/* only what you need */],
  makeCache: Options.cacheWithLimits({
    MessageManager: 50,
    GuildMemberManager: 200,
  }),
});`}
        />
        <H2 id="tips">Other quick wins</H2>
        <UL
          items={[
            'Stream large files instead of loading them fully into memory.',
            'Paginate database queries rather than fetching every row.',
            'Remove unused dependencies — some load a lot at startup.',
            <>Set <C>NODE_ENV=production</C>: many libraries use less memory in production mode.</>,
          ]}
        />
        <Callout kind="tip">A steadily rising memory graph that never goes down usually means a leak, such as event listeners added on every command.</Callout>
      </>
    ),
  },
  {
    slug: 'useful-logs',
    section: 'Best practices',
    title: 'Writing logs that help',
    summary: 'Find problems in seconds instead of hours.',
    minutes: 3,
    body: (
      <>
        <P>Good logs answer three questions: what happened, where, and for whom. Bad logs are either silent or so noisy that the real error is buried.</P>
        <DoDont
          dos={['Prefix lines with a level: INFO, WARN, ERROR.', 'Include an identifier (user, guild, request id).', 'Log the start and end of important tasks.']}
          donts={['Log every incoming message or request.', 'Print full objects that contain tokens or emails.', 'Use console.log("here") style debugging in production.']}
        />
        <CodeBlock
          lang="text"
          title="Clear, searchable output"
          code={`INFO  command=/play guild=8823 user=1102 took=142ms
WARN  rate limited route=/channels/:id/messages retry=1.2s
ERROR failed to save playlist guild=8823 reason="connection timeout"`}
        />
      </>
    ),
  },
  {
    slug: 'troubleshooting',
    section: 'Troubleshooting',
    title: 'Fixing a failed deployment',
    summary: 'The most common errors and how to solve them.',
    minutes: 5,
    featured: true,
    body: (
      <>
        <P>When a deployment fails, your previous version keeps running. Open the failed deployment, read the last lines of its logs, and find the matching case below.</P>
        <Table
          head={['You see', 'Likely cause', 'Fix']}
          rows={[
            [<C key="1">{'Missing script: "start"'}</C>, 'No start command defined.', <>Add a <C>start</C> script to <C>package.json</C> or set one in Settings.</>],
            [<C key="2">Health check timed out</C>, 'App listens on a fixed port.', <>Listen on <C>process.env.PORT</C>.</>],
            [<C key="3">Cannot find module</C>, 'Dependency missing from package.json.', <>Install it with <C>npm install name</C> and commit the lockfile.</>],
            [<C key="4">Out of memory</C>, 'Plan too small or memory leak.', 'Check the Metrics tab, then upgrade or reduce usage.'],
            [<C key="5">TokenInvalid</C>, 'Wrong or missing secret.', <>Check the variable name and value in <C>Environment</C>.</>],
            [<C key="6">Crash loop detected</C>, 'Process exits right after starting.', 'Run the start command locally to see the first error.'],
          ]}
        />
        <H2 id="still-stuck">Still stuck?</H2>
        <P>Open a ticket from the <B>Support</B> page and include the deployment ID. Our team can see the same logs you do and usually answers within a few hours.</P>
      </>
    ),
  },
];

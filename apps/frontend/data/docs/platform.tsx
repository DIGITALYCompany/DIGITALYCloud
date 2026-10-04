import type { DocArticle } from './types';
import { B, C, Callout, CodeBlock, H2, P, Steps, Table, UL } from './primitives';

export const PLATFORM_DOCS: DocArticle[] = [
  {
    slug: 'environment-variables',
    section: 'Configuration',
    title: 'Environment Variables',
    summary: 'Store secrets and configuration safely.',
    minutes: 3,
    body: (
      <>
        <P>Environment variables are encrypted at rest and injected into your service when it starts. Changing a variable triggers a restart so the new value is picked up.</P>
        <CodeBlock lang="bash" code={`DISCORD_TOKEN=************\nDATABASE_URL=************\nNODE_ENV=production`} />
        <H2 id="naming">Naming conventions</H2>
        <UL
          items={[
            <>Use uppercase with underscores: <C>STRIPE_SECRET_KEY</C>, not <C>stripeKey</C>.</>,
            <>Prefix related values so they are easy to find: <C>DB_HOST</C>, <C>DB_USER</C>, <C>DB_PASSWORD</C>.</>,
            <>Keep a <C>.env.example</C> file in your repository listing every variable name, without values.</>,
          ]}
        />
        <H2 id="reserved">Reserved variables</H2>
        <Table
          head={['Variable', 'Value']}
          rows={[
            [<C key="p">PORT</C>, 'The port your web server must listen on.'],
            [<C key="r">DIGITALY_REGION</C>, <>The region running your service, e.g. <C>lyon</C>.</>],
            [<C key="d">DIGITALY_DEPLOYMENT_ID</C>, 'Unique identifier of the current deployment.'],
          ]}
        />
        <Callout kind="warning">Never expose secret credentials in your source code or in your logs.</Callout>
      </>
    ),
  },
  {
    slug: 'deployments',
    section: 'Configuration',
    title: 'Deployments',
    summary: 'How builds, health checks and rollbacks work.',
    minutes: 4,
    body: (
      <>
        <P>Every deployment runs through five stages. If any stage fails, the previous version keeps running and your users notice nothing.</P>
        <Steps
          items={[
            { title: 'Prepare environment', body: 'A clean, isolated container is created with your selected runtime.' },
            { title: 'Pull source', body: 'We fetch the exact commit, archive or image you deployed.' },
            { title: 'Install dependencies', body: 'Packages are installed from your lockfile. Caches are reused between deploys to keep this fast.' },
            { title: 'Start service', body: 'Your start command runs with your environment variables injected.' },
            { title: 'Health check', body: 'We wait for the process to stay up (and for web services, to answer on its port) before switching traffic.' },
          ]}
        />
        <H2 id="rollback">Rolling back</H2>
        <P>Open the <C>Deployments</C> tab of a service and click <C>Redeploy</C> on any previous successful deployment. It is live within seconds because the build is already cached.</P>
        <H2 id="auto">Automatic deploys</H2>
        <P>When a service is connected to GitHub, every push to the selected branch starts a new deployment. You can pause automatic deploys from the service settings during sensitive periods.</P>
      </>
    ),
  },
  {
    slug: 'logs',
    section: 'Operations',
    title: 'Logs',
    summary: 'Stream, search and download your logs.',
    minutes: 2,
    body: (
      <>
        <P>Anything your app writes to <C>stdout</C> or <C>stderr</C> appears in the Logs tab in real time, with a timestamp and a level.</P>
        <H2 id="levels">Log levels</H2>
        <P>Lines written to <C>stderr</C>, or that start with <C>ERROR</C> or <C>WARN</C>, are highlighted so you can spot problems quickly. Use the level filter to show only errors.</P>
        <H2 id="retention">Retention</H2>
        <P>Free plans keep the most recent logs of the running deployment. Paid plans keep a longer searchable history. You can download logs at any time as a text file.</P>
        <Callout kind="tip">Read “Writing logs that help” in Best practices to get the most out of this tab.</Callout>
      </>
    ),
  },
  {
    slug: 'api',
    section: 'Operations',
    title: 'REST API',
    summary: 'Automate DIGITALYCloud with the REST API.',
    minutes: 3,
    body: (
      <>
        <P>Create an API key in <C>Settings → API Keys</C>, then call the API with a bearer token. Keys can be revoked at any time.</P>
        <CodeBlock
          lang="bash"
          code={`curl https://api.cloud.digitaly.fr/v1/services/syncbot/deploy \\
  -X POST \\
  -H "Authorization: Bearer dgc_live_..."`}
        />
        <H2 id="endpoints">Common endpoints</H2>
        <Table
          head={['Method', 'Path', 'Description']}
          rows={[
            ['GET', <C key="1">/v1/services</C>, 'List your services'],
            ['GET', <C key="2">/v1/services/:id</C>, 'Get a service and its current status'],
            ['POST', <C key="3">/v1/services/:id/deploy</C>, 'Start a new deployment'],
            ['POST', <C key="4">/v1/services/:id/restart</C>, 'Restart a service'],
            ['GET', <C key="5">/v1/services/:id/logs</C>, 'Fetch recent log lines'],
          ]}
        />
        <Callout kind="warning">Treat API keys like passwords. Store them as secrets in your CI, never in your repository.</Callout>
      </>
    ),
  },
  {
    slug: 'billing',
    section: 'Account',
    title: 'Billing',
    summary: 'Plans, invoices and payment methods.',
    minutes: 2,
    body: (
      <>
        <P>Plans are billed monthly in euros, VAT included. Each service has its own plan, so you only pay for what you actually run.</P>
        <UL
          items={[
            <><B>Upgrades</B> are prorated and take effect immediately.</>,
            <><B>Downgrades</B> apply right away; the unused difference is credited to your next invoice.</>,
            <><B>Invoices</B> are available as PDF from the Billing page at the start of each month.</>,
            <><B>Free plans</B> never require a payment method.</>,
          ]}
        />
      </>
    ),
  },
  {
    slug: 'team-access',
    section: 'Account',
    title: 'Team access',
    summary: 'Invite teammates and control what they can do.',
    minutes: 2,
    body: (
      <>
        <P>Invite collaborators from <C>Settings → Team</C>. Everyone signs in with their own account, so you always know who did what.</P>
        <Table
          head={['Role', 'Can do']}
          rows={[
            ['Owner', 'Everything, including billing and deleting the account.'],
            ['Admin', 'Manage services, deployments, variables and team members.'],
            ['Developer', 'Deploy, restart and read logs. Cannot see billing.'],
          ]}
        />
        <Callout kind="tip">Give people the lowest role they need. You can always promote them later.</Callout>
      </>
    ),
  },
];

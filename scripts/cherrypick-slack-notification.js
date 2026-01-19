#!/usr/bin/env node

/**
 * Cherrypick Workflow Slack Notification Script
 * Sends formatted Slack notifications for cherrypick workflow status
 */

const https = require('https');

// Configuration
const CONFIG = {
  SLACK_API_URL: 'https://slack.com/api/chat.postMessage',
  LOG_PREFIX: '[CHERRYPICK-SLACK]'
};

// Logging utilities
const log = {
  info: (msg) => console.log(`${CONFIG.LOG_PREFIX} ℹ️  ${msg}`),
  success: (msg) => console.log(`${CONFIG.LOG_PREFIX} ✅ ${msg}`),
  error: (msg) => console.log(`${CONFIG.LOG_PREFIX} ❌ ${msg}`),
  warn: (msg) => console.log(`${CONFIG.LOG_PREFIX} ⚠️  ${msg}`)
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    options[key] = value;
  }
  
  return options;
}

/**
 * Format user mention for Slack
 */
function formatUserMention(slackUserId, fallbackUsername) {
  // If it's a Slack user ID (starts with U), use it directly
  if (slackUserId && slackUserId.startsWith('U')) {
    return `<@${slackUserId}>`;
  }
  // Otherwise, try username (might work if GitHub username matches Slack username)
  return `<@${slackUserId || fallbackUsername}>`;
}

/**
 * Create Slack message blocks for cherrypick workflow
 */
function createSlackBlocks(options) {
  const {
    appVersion,
    codepushBranch,
    successPrs = [],
    conflictPrs = [],
    nativePrs = [],
    successCount = 0,
    conflictCount = 0,
    nativeCount = 0,
    workflowUrl
  } = options;

  const blocks = [];
  
  // Determine overall status
  let statusEmoji = '✅';
  let statusText = 'Success';
  if (conflictCount > 0) {
    statusEmoji = '❌';
    statusText = 'Failed (Merge Conflicts)';
  } else if (successCount === 0 && conflictCount === 0 && nativeCount > 0) {
    statusEmoji = '⚠️';
    statusText = 'No PRs to Cherry-pick';
  } else if (conflictCount === 0 && successCount > 0) {
    statusEmoji = '✅';
    statusText = 'Success';
  }

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${statusEmoji} Cherrypick Workflow - v${appVersion}`,
      emoji: true
    }
  });

  // Summary section
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Status:* ${statusText}\n*Codepush Branch:* \`${codepushBranch}\`\n*App Version:* v${appVersion}`
    }
  });

  // Divider
  blocks.push({ type: 'divider' });

  // Results summary
  const summaryFields = [];
  summaryFields.push({
    type: 'mrkdwn',
    text: `*✅ Successfully Cherry-picked:*\n${successCount}`
  });
  summaryFields.push({
    type: 'mrkdwn',
    text: `*⚠️ Merge Conflicts:*\n${conflictCount}`
  });
  summaryFields.push({
    type: 'mrkdwn',
    text: `*🚫 Discarded (Native Changes):*\n${nativeCount}`
  });

  blocks.push({
    type: 'section',
    fields: summaryFields
  });

  // Native changes section
  if (nativePrs.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🚫 PRs Discarded (Native Changes)*\n${nativePrs.map(pr => `• PR #${pr.number}: ${pr.title} (by ${formatUserMention(pr.slackUserId, pr.author)})`).join('\n')}`
      }
    });
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'ℹ️ These PRs contain changes in `android/` or `ios/` folders and cannot be cherry-picked.'
        }
      ]
    });
  }

  // Conflict section
  if (conflictPrs.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ PRs with Merge Conflicts*\n${conflictPrs.map(pr => `• PR #${pr.number}: ${pr.title} (by ${formatUserMention(pr.slackUserId, pr.author)}) - Commit: \`${pr.commit.substring(0, 7)}\``).join('\n')}`
      }
    });
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '⚠️ These PRs need to be manually cherry-picked with conflicts resolved.'
        }
      ]
    });
  }

  // Success section
  if (successPrs.length > 0) {
    blocks.push({ type: 'divider' });
    const successText = successPrs.map((pr, index) => {
      const order = pr.order || (index + 1);
      return `• *Order ${order}*: PR #${pr.number} - ${pr.title} (by ${formatUserMention(pr.slackUserId, pr.author)}) - Commit: \`${pr.commit.substring(0, 7)}\``;
    }).join('\n');
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*✅ Successfully Cherry-picked PRs (in merge order)*\n${successText}`
      }
    });
  }

  // Workflow link button
  if (workflowUrl) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Workflow',
            emoji: true
          },
          url: workflowUrl,
          style: 'primary'
        }
      ]
    });
  }

  return blocks;
}

/**
 * Lookup Slack user by email
 */
function lookupSlackUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const botToken = process.env.SLACK_BOT_TOKEN;
    
    if (!botToken) {
      reject(new Error('SLACK_BOT_TOKEN environment variable is required'));
      return;
    }
    
    if (!email) {
      resolve(null);
      return;
    }
    
    // users.lookupByEmail is a GET request with email as query parameter
    const encodedEmail = encodeURIComponent(email);
    const options = {
      hostname: 'slack.com',
      port: 443,
      path: `/api/users.lookupByEmail?email=${encodedEmail}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ok && response.user) {
            resolve(response.user.id);
          } else {
            // User not found or error - return null to fallback to username
            log.warn(`Slack user lookup failed for ${email}: ${response.error || 'user not found'}`);
            resolve(null);
          }
        } catch (error) {
          log.warn(`Failed to parse Slack lookup response: ${error.message}`);
          resolve(null);
        }
      });
    });
    
    req.on('error', (error) => {
      log.warn(`Slack lookup request failed: ${error.message}`);
      resolve(null);
    });
    
    req.end();
  });
}

/**
 * Resolve user mentions - convert emails/usernames to Slack user IDs
 */
async function resolveUserMentions(prs) {
  const userCache = {};
  const resolvedPrs = [];
  
  // Hardcoded email mapping for testing
  const hardcodedEmailMap = {
    'Yaswanth-d11': 'yaswanthmotupalli45@gmail.com'
  };
  
  for (const pr of prs) {
    let slackUserId = null;
    let emailToUse = pr.email;
    
    // Use hardcoded email if available for this user
    if (hardcodedEmailMap[pr.author]) {
      emailToUse = hardcodedEmailMap[pr.author];
      log.info(`Using hardcoded email for ${pr.author}: ${emailToUse}`);
    }
    
    // Try to lookup by email if available
    if (emailToUse) {
      if (userCache[emailToUse]) {
        slackUserId = userCache[emailToUse];
      } else {
        slackUserId = await lookupSlackUserByEmail(emailToUse);
        userCache[emailToUse] = slackUserId;
      }
    }
    
    // Fallback to username if email lookup failed
    if (!slackUserId) {
      slackUserId = pr.author;
    }
    
    resolvedPrs.push({
      ...pr,
      slackUserId: slackUserId
    });
  }
  
  return resolvedPrs;
}

/**
 * Send Slack message
 */
function sendSlackMessage(blocks, channel) {
  return new Promise((resolve, reject) => {
    const botToken = process.env.SLACK_BOT_TOKEN;
    
    if (!botToken) {
      reject(new Error('SLACK_BOT_TOKEN environment variable is required'));
      return;
    }
    
    const payload = JSON.stringify({
      channel: channel || process.env.SLACK_CHANNEL,
      text: 'Cherrypick workflow update',
      blocks: blocks
    });
    
    const options = {
      hostname: 'slack.com',
      port: 443,
      path: '/api/chat.postMessage',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ok) {
            log.success('Slack message sent successfully');
            resolve(response);
          } else {
            log.error(`Slack API error: ${response.error}`);
            reject(new Error(response.error));
          }
        } catch (error) {
          log.error(`Failed to parse Slack response: ${error.message}`);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      log.error(`Slack API request failed: ${error.message}`);
      reject(error);
    });
    
    req.write(payload);
    req.end();
  });
}

/**
 * Main execution function
 */
async function main() {
  try {
    const options = parseArgs();
    
    // Required arguments
    if (!options['app-version']) {
      throw new Error('--app-version is required');
    }
    if (!options['codepush-branch']) {
      throw new Error('--codepush-branch is required');
    }

    // Parse JSON arrays
    let successPrs = [];
    let conflictPrs = [];
    let nativePrs = [];
    
    if (options['success-prs']) {
      try {
        successPrs = JSON.parse(options['success-prs']);
      } catch (error) {
        log.warn(`Failed to parse success-prs: ${error.message}`);
      }
    }
    
    if (options['conflict-prs']) {
      try {
        conflictPrs = JSON.parse(options['conflict-prs']);
      } catch (error) {
        log.warn(`Failed to parse conflict-prs: ${error.message}`);
      }
    }
    
    if (options['native-prs']) {
      try {
        nativePrs = JSON.parse(options['native-prs']);
      } catch (error) {
        log.warn(`Failed to parse native-prs: ${error.message}`);
      }
    }

    const successCount = parseInt(options['success-count'] || '0', 10);
    const conflictCount = parseInt(options['conflict-count'] || '0', 10);
    const nativeCount = parseInt(options['native-count'] || '0', 10);
    
    log.info('Creating cherrypick Slack notification...');
    log.info(`App Version: ${options['app-version']}`);
    log.info(`Codepush Branch: ${options['codepush-branch']}`);
    log.info(`Success: ${successCount}, Conflicts: ${conflictCount}, Native: ${nativeCount}`);
    
    // Resolve user mentions (lookup Slack user IDs from emails)
    log.info('Resolving user mentions...');
    const resolvedSuccessPrs = await resolveUserMentions(successPrs);
    const resolvedConflictPrs = await resolveUserMentions(conflictPrs);
    const resolvedNativePrs = await resolveUserMentions(nativePrs);
    
    // Create Slack blocks
    const blocks = createSlackBlocks({
      appVersion: options['app-version'],
      codepushBranch: options['codepush-branch'],
      successPrs: resolvedSuccessPrs,
      conflictPrs: resolvedConflictPrs,
      nativePrs: resolvedNativePrs,
      successCount,
      conflictCount,
      nativeCount,
      workflowUrl: options['workflow-url']
    });
    
    // Send message
    await sendSlackMessage(blocks, options.channel);
    
    log.success('Cherrypick Slack notification sent successfully!');
    process.exit(0);
    
  } catch (error) {
    log.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { createSlackBlocks, sendSlackMessage };


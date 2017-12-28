'use strict';

const AWS = require('aws-sdk');
const https = require('https');
const logger = require('console');
const querystring = require('querystring');

const config = {
  BLACKLIST_BUCKET     : process.env.BLACKLIST_BUCKET,
  BLACKLIST_KEY        : process.env.BLACKLIST_KEY,
  DOMAIN_WHITELIST     : process.env.DOMAIN_WHITELIST ? process.env.DOMAIN_WHITELIST.split(',') : undefined,
  CONFIG_SET_NAME      : process.env.CONFIG_SET_NAME,
  EMAIL_PUBLISHER      : process.env.EMAIL_PUBLISHER,
  EMAIL_SUBJECT_PREFIX : process.env.EMAIL_SUBJECT_PREFIX || '',
  EMAIL_TEMPLATE       : process.env.EMAIL_TEMPLATE,
  MAILCHIMP_API_KEY    : process.env.MAILCHIMP_API_KEY,
  MAILCHIMP_API_DC     : process.env.MAILCHIMP_API_DC,
  MAILCHIMP_LIST_ID    : process.env.MAILCHIMP_LIST_ID,
  MAILCHIMP_USER_ID    : process.env.MAILCHIMP_USER_ID,
  MAILCHIMP_USERNAME   : process.env.MAILCHIMP_USERNAME,
};

const fetchBlacklist = () => {
  return new Promise((resolve, reject) => {
    const s3client = new AWS.S3();

    s3client.getObject({
      Bucket : config.BLACKLIST_BUCKET,
      Key    : config.BLACKLIST_KEY
    }, (err, data) => {
      if (err) {
        if (404 === err.statusCode)
          return resolve([]);

        return reject(err);
      }

      return resolve(JSON.parse(data.Body.toString()));
    });
  });
}

const fetchSubscribers = new Promise((resolve, reject) => {
  const query = querystring.stringify({
    count  : 1000,
    fields : 'members.id,members.email_address,members.status,total_items',
    status : 'subscribed'
  });

  https.get({
    auth : `${config.MAILCHIMP_USERNAME}:${config.MAILCHIMP_API_KEY}`,
    host : `${config.MAILCHIMP_API_DC}.api.mailchimp.com`,
    path : `/3.0/lists/${config.MAILCHIMP_LIST_ID}/members?${query}`,
  }, (response) => {
      const body = [],
            onEnd  = () => resolve(JSON.parse(body.toString()).members),
            onData = (chunk) => { body.push(chunk); };

      response.on('data', onData).on('end', onEnd);
  });
});

const fetchRandomJoke = (blacklist, retries) => {
  return new Promise((resolve, reject) => {
    https.get({
      host : 'api.chucknorris.io',
      path : '/jokes/random',
    }, (response) => {
        const body = [],
              onEnd  = () => {
                const joke = JSON.parse(body.toString());

                if (-1 >= blacklist.indexOf(joke.id))
                  return resolve(joke);

                if (0 === retries)
                  return reject('Cannot find random joke');

                return resolve(fetchRandomJoke(blacklist, retries - 1));
              },
              onData = (chunk) => { body.push(chunk); };

        response.on('data', onData).on('end', onEnd);
    });
  });
};

const MAX_RECIPIENT = 1;

const sendEmail = (params) => {
  return new Promise((resolve, reject) => {

    const unsubscribeUrl = `https://${config.MAILCHIMP_USERNAME}.${config.MAILCHIMP_API_DC}.list-manage.com/unsubscribe?u=${config.MAILCHIMP_USER_ID}&id=${config.MAILCHIMP_LIST_ID}`;

    const parameters = {
      Destinations : params.recipients.map(recipient => {
        return {
          Destination: {
            ToAddresses: [ recipient.email ]
          },
          ReplacementTemplateData: JSON.stringify({
            issueNr        : String(params.issue),
            jokeUrl        : String(params.joke.url),
            jokeValue      : String(params.joke.value),
            unsubscribeUrl : `${unsubscribeUrl}&e=${recipient.emailId}`
          })
        }
      }),
      ConfigurationSetName : config.CONFIG_SET_NAME,
      DefaultTags : [{
        Name  : 'campaign',
        Value : 'TheDailyChuck'
      }],
      DefaultTemplateData: JSON.stringify({
        issueNr        : String(params.issue),
        jokeUrl        : String(params.joke.url),
        jokeValue      : String(params.joke.value),
        unsubscribeUrl : unsubscribeUrl
      }),
      Source       : config.EMAIL_PUBLISHER,
      Template     : config.EMAIL_TEMPLATE
    };

    const ses = new AWS.SES({
      region : 'eu-west-1'
    });

    ses.sendBulkTemplatedEmail(parameters, (err, data) => {
      if (err) {
        logger.error(err);
        return reject(err);
      }

      const response = data.Status.map((el, i) => {
        return {
          email     : params.recipients[i].email,
          requestId : data.ResponseMetadata.RequestId,
          status    : el.Status,
          messageId : el.MessageId
        };
      });

      return resolve(response);
    });
  });
};

const writeBlacklist = (blacklist) => {
  new Promise((resolve, reject) => {
    const s3client = new AWS.S3();

    s3client.putObject({
      Body   : JSON.stringify(blacklist),
      Bucket : config.BLACKLIST_BUCKET,
      Key    : config.BLACKLIST_KEY
    }, (err) => {
      if (err)
        return reject(err);

      return resolve(true);
    });
  });
}

module.exports.main = (event, context, callback) => {
  const blacklist = [],
        joke = {},
        recipients = [];

  fetchSubscribers.then((subscribers) => {
    return subscribers
      .filter(subscriber => 'subscribed' === subscriber.status)
      .filter(subscriber => {
        if (! config.DOMAIN_WHITELIST)
          return true;

        const domain = subscriber.email_address.replace(/.*@/, '');
        return -1 < config.DOMAIN_WHITELIST.indexOf(domain);
      })
      .map(subscriber => ({
        id      : subscriber.id,
        email   : subscriber.email_address,
        emailId : subscriber.unique_email_id
      }));
  })
  .then(res => Object.assign(recipients, res))

  // Return early if no active recipients have been found
  .then(() => {
    if (1 > recipients.length) callback(null, 'No active recipients found.')
  })

  // Fetch blacklist
  .then(() => fetchBlacklist())
  .then(res => Object.assign(blacklist, res))

  // Get random joke
  .then(() => fetchRandomJoke(blacklist.map(el => el.jokeId), 3))
  .then(res => Object.assign(joke, res))

  // Send mail
  .then(() => sendEmail({ recipients, joke, issue: 1 + blacklist.length }))

  // Add current joke to blacklist
  .then((res) => {
    blacklist.push({
      date      : (new Date()).toUTCString(),
      campaign  : 'TheDailyChuck',
      jokeId    : joke.id,
      status    : res
    });
  })

  // Update blacklist
  .then(() => writeBlacklist(blacklist))

  // Finish job
  .then((res) => {
    callback(undefined, { blacklist, joke, recipients });
  })
  .catch((err) => callback(err));
};

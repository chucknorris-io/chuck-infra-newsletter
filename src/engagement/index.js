const console = require('console');

module.exports.main = (event, context, callback) => {
  console.log('Event', JSON.stringify(event));

  return callback();
};

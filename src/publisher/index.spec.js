const assert = require('chai').assert;
const component = require('./index.js');
const pkg = require('./../../package.json');

describe(`${pkg.name}/publisher`, () => {

  it('#main', (done) => {
    component.main({}, {}, (err, res) => {
      assert.isUndefined(err);

      assert.hasAllKeys(res, ['blacklist', 'joke', 'recipients']);
      assert.isArray(res.blacklist);
      assert.isObject(res.joke);
      assert.isArray(res.recipients);

      done();
    });
  });

});

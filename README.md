# Chuck Norris Newsletter

## Setup

**(1) Create AWS SES email templates**

```bash
# Create aws ses email templates
aws ses create-template --cli-input-json 'file://src/publisher/template/daily_chuck.dev.json'

# Test template
echo '{
  "Source": "Chuck Norris <chuck@chucknorris.io>",
  "Template": "TheDailyChuck-dev",
  "Destination": {
    "BccAddresses": [ "m@matchilling.com" ]
  },
  "TemplateData": "{\"issueNr\":\"1\",\"jokeUrl\":\"https://api.chucknorris.io/jokes/rmmcukl2t6sottj2rvuuvg\",\"jokeValue\":\"Chuck Norris can unit test entire applications with a single assert.\",\"unsubscribeUrl\":\"https://matchilling.us17.list-manage.com/unsubscribe?u=aa0ea0f3e3c1967e3ffb161ef&id=da67274af1\"}"
}' > email.json

$ aws ses send-templated-email --cli-input-json 'file://email.json'
# {
#   "MessageId": "010201609cde8d2b-c52a85a5-db1e-4a38-8204-fcf5bb0154e9-000000"
# }
```

**(2) Create SNS topic**
```bash
$ aws sns create-topic --name chuck-email-engagement-prod
# {
#   "TopicArn": "arn:aws:sns:{REGION}:{ACCOUNT_ID}:chuck-email-engagement-{STAGE}"
# }
```

**(3) Create SES configuration set**
```bash
$ aws ses create-configuration-set --configuration-set Name=TheDailyChuck-prod
$ aws ses list-configuration-sets
# {
#   "ConfigurationSets": [
#     {
#         "Name": "TheDailyChuck-dev"
#     },
#     {
#         "Name": "TheDailyChuck-prod"
#     }
#   ]
# }
```

**(4) Deploy lambda functions**
```bash
$ ./node_modules/.bin/serverless deploy --stage=dev
```

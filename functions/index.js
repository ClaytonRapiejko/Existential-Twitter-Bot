const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Database reference
const dbRef = admin.firestore().doc('tokens/demo');

// Twitter API init
const TwitterApi = require('twitter-api-v2').default;
const twitterClient = new TwitterApi({
  clientId: 'Y05UNEY4ZE9RaGxkblhpeG9wQ286MTpjaQ',
  clientSecret: 'hZjgeZsE9dcb5IUKGPB2Ki3CtObQJ2eVplE_QNTkFq0XaDs47B',
});

const callbackURL = 'https://twitter202020.firebaseapp.com/__/auth/handler';

// OpenAI API init
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
  organization: 'org-qRRk7psQnpgpad2f1D9dbjuw',
  apiKey: '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',
});
const openai = new OpenAIApi(configuration);

// STEP 1 - Auth URL
exports.auth = functions.https.onRequest((request, response) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    callbackURL,
    { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
  );

  // store verifier
  await dbRef.set({ codeVerifier, state });

  response.redirect(url);
});

// STEP 2 - Verify callback code, store access_token 
exports.callback = functions.https.onRequest((request, response) => {
  const { state, code } = request.query;

  const dbSnapshot = await dbRef.get();
  const { codeVerifier, state: storedState } = dbSnapshot.data();

  if (state !== storedState) {
    return response.status(400).send('Stored tokens do not match!');
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackURL,
  });

  await dbRef.set({ accessToken, refreshToken });

  const { data } = await loggedClient.v2.me(); // start using the client if you want

  response.send(data);
});

// STEP 3 - Refresh tokens and post tweets
exports.tweet = functions.https.onRequest((request, response) => {
  const { refreshToken } = (await dbRef.get()).data();

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(refreshToken);

  await dbRef.set({ accessToken, refreshToken: newRefreshToken });

  const nextTweet = await openai.createCompletion('text-davinci-001', {
    prompt: 'tweet something cool for #techtwitter',
    max_tokens: 64,
  });

  const { data } = await refreshedClient.v2.tweet(
    nextTweet.data.choices[0].text
  );

  response.send(data);
});


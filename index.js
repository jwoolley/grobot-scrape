const request = require('request-promise-native');
const jsdom = require('jsdom').JSDOM;
const encoder = require('js-htmlencode');
const fs = require('fs');

const jar = request.jar();

const placeholderHtml = '<html><body></body></html>';
const homepage = 'http://s6.zetaboards.com/EmpireLost/index/';
const hostname = 'http://s6.zetaboards.com/EmpireLost';
const loginPage = 'http://s6.zetaboards.com/EmpireLost/login/log_in/';
const testPage = 'http://s6.zetaboards.com/EmpireLost/topic/8785539/1/';

// general utility functions

function hash(str) {
  var hash = 0, i, chr;
  if (str.length === 0) { 
    return hash;
  }
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return btoa(hash);
}

// request utility functions

function loadCookies(filepath) {
  const data = fs.readFileSync(filepath);
  return data.toString().split(/;/g);
}

function loadCredentials(filepath) {
  return require(filepath);
}

function setCookies(jar, cookies, url) {
  console.log('setting cookies:', cookies);
  cookies.forEach(entry => {
    const cookie = request.cookie(entry.trim());
    jar.setCookie(cookie, url);
  });
}

async function getUrl(url, jar) {
  console.log('request: ' + url);
  try {
    return await request.get({url: url, jar: jar});
  } catch (e) {
    console.log(e);
  }
}

// JSDOM utility functions

function getDocument(html) {
  return new jsdom(html).window.document;
}

function querySelectorAll(element, selector) {
  return Array.prototype.slice.call(element.querySelectorAll(selector));
}

// DOM parsing functions

function getLinks(html) {
  const document = getDocument(html);
  const links = querySelectorAll(document, 'a');
  return links.filter(link => !!link.href).map(link => { return {url: link.href, text: link.innerHTML}; });
}

async function getForumLinks(forumUrl, jar) {
  const html = await getUrl(forumUrl, jar);
  return getLinks(html).filter(link => link.url.match(/^.*\/forum\/.*$/));
}

async function getThreadLinks(forumUrl, jar) {
  const html = await getUrl(forumUrl, jar);
  const forums = getLinks(html).filter(link => link.url.match(/^.*\/topic\/.*$/));
}

function getForumId(forumUrl) {
  const match = forumUrl.match(/forum\/(\d+?)\//);
  return match && match[1] ? match[1] : undefined;
}

async function getThreadPage(threadId, page, jar) {
  let html;
  const url = `${hostname}/topic/${threadId}/${page}/`;
  try {
    html = await getUrl(url, jar);
  } catch(e) {
    console.warn('Unable to get ', url + ':');
    console.warn(e);
    html = placeholderHtml;
  }
  return html;
}

function scrapeThread(html) {
  const postHeaderSelector = 'td.c_postinfo';
  const postSelector = 'td.c_post';  
  const document = getDocument(html);
  
  const postHeaders = querySelectorAll(document, postHeaderSelector).map(postinfo => postinfo.parentNode);
  const posts = querySelectorAll(document, postSelector);
  posts.forEach((post, i) => {
    const header = postHeaders[i];
    const poster = header.querySelector('a.member').innerHTML.trim();   
    const timestamp = header.querySelector('.c_postinfo span').innerHTML.trim();
    const postText = post.innerHTML.trim()

    // TODO save post index (and post id, for anti-duplication insurance?)
    // TODO save poster avatar? join date?

    console.log(poster);
    console.log(timestamp);
    console.log(postText);
    console.log('\n');
  });
}

const forumListingQs = 'cutoff=5000&sort_by=DESC&sort_key=last_unix';

async function walkForum(forumId, jar) {
  const threads = [];

  // ... walk forum and collect threads. return list of thread ids
}


async function walkThread(threadId, jar) {
  const posts = [];

  const firstPage = getThreadPage(threadId, 1, jar)
}

// async function walkThreads(forumUrl, forumName='home', visited={}) {
//   const forum = { url: forumUrl, name: forumName, subforums: {} };
  
//   try {
//     const subforums = await getForumLinks(forumUrl);
//     subforums.filter(subforum => !visited[getForumId(subforum.url)]).forEach(async subforum => { 
//       console.log(`${forumName} subforum:`, subforum);
//       const subsubforums = await walkThreads(subforum.url, subforum.text, visited);
//       Object.assign(forum.subforums, subsubforums);
//       Object.assign(visited, subsubforums.visited);
//       console.log('subforums:', subsubforums);
//       console.log(visited, visited);
//     });

//     visited[getForumId(forumUrl)] = forum;
//   } catch (e) {
//     console.warn(e);
//   }
//   return forum;
// }

// scraping logic

async function getForums(forumUrl, jar) {
  const forum = { url: forumUrl, name: 'home', subforums: [] };
  
  const subforums = await getForumLinks(forumUrl, jar);
  subforums.forEach(subforum => forum.subforums.push({ id: getForumId(subforum.url), url: subforum.url, name: subforum.text }));

  return forum;
}

if (!process.argv[2]) {
  console.log('usage: node index.js [path-to-cookie]');
  process.exit(0);
}
const filePath = process.argv[2];

async function login(loginUrl, credentials, jar) {
  console.log('request: ' + loginUrl);
  const options = {
    method: 'POST',
    url: loginUrl,
    form: { 
      uname: credentials.username,
      pw: credentials.password,
    },
    headers: {},
    simple: false,
    jar: jar
  }
  try {
    const response = await request.get(options);
    // console.log('cookies: ', jar.getCookieString(loginUrl));
  } catch (e) {
    console.log(e);
  }
}

const credentials = loadCredentials('./' + filePath);
console.log('credentials:', credentials);

(async () => {
  await login(loginPage, credentials, jar);

  const page = await getThreadPage(8905568, 1, jar);
  await scrapeThread(page);
  // console.log(page);

  // const html = await getUrl(testPage, jar);
  // console.log(html);
})();

// setCookies(jar, loadCookies(filePath), homepage);
   
// (async () => {
//   // const forums = await getForums(homepage);
//   // console.log('Forums:\n', forums);

//   const page = await getThreadPage(8905568, 1);
//   // await scrapeThread(page);
//   console.log(page);
// })();
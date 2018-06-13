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

const requestOptions = {
  postsPerPage: '100'
};

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

async function getUrl(url, jar, qs) {
  console.log(`--> ${url}`);
  try {
    return await request.get({url: url, qs: qs, jar: jar});
  } catch (e) {
    console.log(e);
  }
}

async function getPage(url, jar) {
  const qs = {
    x: requestOptions.postsPerPage
  };
  return getUrl(url, jar, qs);
}

// JSDOM utility functions

function getDocument(html) {
  return new jsdom(html).window.document;
}

function querySelectorAll(element, selector) {
  return Array.prototype.slice.call(element.querySelectorAll(selector));
}

// DOM parsing functions

// gets text of the current element, not including text of child elements
function getTextOnly(element) {
  return Array.prototype.reduce.call(element.childNodes,(a, b) => { return a + (b.nodeType === 3 ? b.textContent : ''); }, '');
}

function getLinks(html) {
  const document = getDocument(html);
  const links = querySelectorAll(document, 'a');
  return links.filter(link => !!link.href).map(link => { return {url: link.href, text: link.innerHTML}; });
}

async function getForumLinks(forumUrl, jar) {
  const html = await getPage(forumUrl, jar);
  return getLinks(html).filter(link => link.url.match(/^.*\/forum\/.*$/));
}

async function getThreadLinks(forumUrl, jar) {
  const html = await getPage(forumUrl, jar);
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
    html = await getPage(url, jar);
  } catch(e) {
    console.warn('Unable to get ', url + ':');
    console.warn(e);
    html = placeholderHtml;
  }
  return html;
}

// thread page has page links past the current page
function getNumPages(html) {
  const lastPageLinkLocator = 'ul.cat-pages li:last-child a';
  const document = getDocument(html);
  const lastPageLink = document.querySelector(lastPageLinkLocator);
  return lastPageLink && parseInt(lastPageLink.innerHTML) ? parseInt(lastPageLink.innerHTML) : 1;
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

function getThreadInfo(html)  {
  function getThreadTitle(document) {
    const threadTitleLocator = '#topic_viewer th';    
    return getTextOnly(document.querySelector(threadTitleLocator)).trim().match(/^(.*?);?$/)[1];
  }

  function getThreadSubtitle(document) {
    const threadSubtitleLocator = '#topic_viewer th small';    
    const subtitle = document.querySelector(threadSubtitleLocator);
    return subtitle ? subtitle.textContent.trim() : undefined;
  }

  function getThreadAuthor(document) {
    const firstPosterSelector = '#topic_viewer tbody td.c_username';
    return document.querySelector(firstPosterSelector).textContent.trim();
  }

  const document = getDocument(html);

  return {
    title:    getThreadTitle(document),
    subtitle: getThreadSubtitle(document),
    author:   getThreadAuthor(document) 
  };
}

async function walkThread(threadId, jar) {
  const posts = [];

  const html = await getThreadPage(threadId, 1, jar);
  const totalPages = getNumPages(html);

  //TODO: additional page info: page count, track # posts, parent forum, locked status

  const threadInfo = getThreadInfo(html);

  console.log(`*******************************************************************************************************`);
  console.log(`*\n* ${threadInfo.title}${threadInfo.subtitle ? '; ' + threadInfo.subtitle : ''} [${threadInfo.author}]\n*`);
  console.log(`*******************************************************************************************************`);

  console.log(`\n========= Page 1 =========`);
  scrapeThread(html);
  for (var i = 2; i <= totalPages; i++) {
    console.log(`\n========= Page ${i} =========`);    
    scrapeThread(await getThreadPage(threadId, i, jar));
  }
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
  console.log(`--> ${loginUrl}`);
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
  } catch (e) {
    console.log(e);
  }
}

const credentials = loadCredentials('./' + filePath);

(async () => {
  await login(loginPage, credentials, jar);

  // const page = await getThreadPage(10007962, 1, jar);
  // await scrapeThread(page);
  // console.log(page);

  await walkThread(10007962, jar);
})();

// setCookies(jar, loadCookies(filePath), homepage);
   
// (async () => {
//   // const forums = await getForums(homepage);
//   // console.log('Forums:\n', forums);

//   const page = await getThreadPage(8905568, 1);
//   // await scrapeThread(page);
//   console.log(page);
// })();
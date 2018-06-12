const request = require('request-promise-native');
const jsdom = require('jsdom').JSDOM;
const encoder = require('js-htmlencode');
const fs = require('fs');

const jar = request.jar();

const homepage = 'http://s6.zetaboards.com/EmpireLost/index/';

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

function setCookies(jar, cookies, url) {
  cookies.forEach(entry => {
    const cookie = request.cookie(entry.trim());
    jar.setCookie(cookie, url);
  });
}

async function getUrl(url) {
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

async function getForumLinks(forumUrl) {
  const html = await getUrl(forumUrl);
  return getLinks(html).filter(link => link.url.match(/^.*\/forum\/.*$/));
}

async function getThreadLinks(forumUrl) {
  const html = await getUrl(forumUrl);
  const forums = getLinks(html).filter(link => link.url.match(/^.*\/topic\/.*$/));
}

function getForumId(forumUrl) {
  const match = forumUrl.match(/forum\/(\d+?)\//);
  return match && match[1] ? match[1] : undefined;
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

async function getForums(forumUrl) {
  const forum = { url: forumUrl, name: 'home', subforums: [] };
  
  const subforums = await getForumLinks(forumUrl);
  subforums.forEach(subforum => forum.subforums.push({ id: getForumId(subforum.url), url: subforum.url, name: subforum.text }));

  return forum;
}

if (!process.argv[2]) {
  console.log('usage: node index.js [path-to-cookie]');
  process.exit(0);
}
const cookiePath = process.argv[2];

setCookies(jar, loadCookies(cookiePath), homepage);
   
(async () => {
  const forums = await getForums(homepage);
  console.log('Forums:\n', forums);
})();
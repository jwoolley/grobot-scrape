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

const DEBUG = false;

const debug = DEBUG ? console : { log: () => {} };

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

function getLinks(html, locator='a') {
  const document = getDocument(html);
  const links = querySelectorAll(document, locator);
  return links.filter(link => !!link.href).map(link => { return {url: link.href, text: link.innerHTML}; });
}

function getParentForumFromHtml(html) {
  const document = getDocument(html);
  return Array.prototype.slice.call(document.querySelector('#nav').querySelectorAll('li'), 0).filter(el => el.textContent && el.textContent.length > 0 && el.textContent !== ">").slice(-2)[0].textContent;
}

async function getForumLinks(forumUrl) {
  const html = await getUrl(forumUrl);
  return getLinks(html, '.forums a').filter(link => link.url.match(/^.*\/forum\/.*$/));
}

function getForumLinksFromHtml(html) {
  return getLinks(html, '.forums a').filter(link => link.url.match(/^.*\/forum\/.*$/));
}

async function getThreadLinks(forumUrl) {
  const html = await getUrl(forumUrl);
  const forums = getLinks(html).filter(link => link.url.match(/^.*\/topic\/.*$/));
  // TODO: finish
}



function getForumId(forumUrl) {
  const match = forumUrl.match(/forum\/(\d+?)\//);
  return match && match[1] ? match[1] : undefined;
}

async function getForums(forumUrl, forumName='home', visited={}, level='*') {
  debug.log(`\n${level}  Walking ${forumName} (${forumUrl})`);

  const forum = { url: forumUrl, name: forumName, subforums: {} };
  visited[getForumId(forumUrl)] = forumUrl;
  try {
    const html = await getUrl(forumUrl);
    const subforums = getForumLinksFromHtml(html);
    const parentForum = getParentForumFromHtml(html);
    Object.assign(forum.subforums, subforums);    
    debug.log(`${parentForum} > ${forumName}`);
    subforums.filter(subforum => !visited[getForumId(subforum.url)]).forEach(async subforum => { 
      const subsubforums = await getForums(subforum.url, subforum.text, visited, level + '*');
      Object.assign(forum.subforums, subsubforums);
      Object.assign(visited, subsubforums.visited);
    });



    visited[getForumId(forumUrl)] = forum;
  } catch (e) {
    console.warn(e);
  }
  return forum;
}

class Forum {
  constructor(name, url) {
    this.name = name;
    this.url = url;
  }
}

async function getAllForums(forumRoot) {
  const forums = await getForums(forumRoot);
  return Object.values(forums.subforums).map(subforum => new Forum(subforum.text, subforum.url));
}

if (!process.argv[2]) {
  console.log('usage: node index.js [path-to-cookie]');
  process.exit(0);
}
const cookiePath = process.argv[2];

setCookies(jar, loadCookies(cookiePath), homepage);
   
const forumQueryParams = 'cutoff=1000&sort_by=DESC&x=100';

const urls = {
  forums: {
    'home': 'http://s6.zetaboards.com/EmpireLost/index/'
  }
};

// test
(async () => {
  const forums = await getAllForums(urls.forums.home);
  console.log(forums);
})();
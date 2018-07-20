const request = require('request-promise-native');
const Cookie = require('tough-cookie'); // request sub-dependency

const jsdom = require('jsdom').JSDOM;
const encoder = require('js-htmlencode');
const fs = require('fs');
const jar = request.jar();

const homepage = 'http://s6.zetaboards.com/';

const EXCLUDED_FORUMS = ['4008777'];

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

function arrayFrom(htmlNodeList) {
  return Array.prototype.slice.call(htmlNodeList);
}

// request utility functions

function loadCookies(filepath) {
  const data = fs.readFileSync(filepath);
  return data.toString().split(/\n/g).map(cookie => cookie.trim());
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
  return arrayFrom(element.querySelectorAll(selector));
}

// DOM parsing functions

function getLinks(html, locator='a') {
  const document = getDocument(html);
  const links = querySelectorAll(document, locator);
  return links.filter(link => !!link.href).map(link => { return {url: link.href, text: link.innerHTML}; });
}

function getParentForumFromHtml(html) {
  const document = getDocument(html);
  return arrayFrom(document.querySelector('#nav').querySelectorAll('li'), 0).filter(el => el.textContent && el.textContent.length > 0 && el.textContent !== ">").slice(-2)[0].textContent;
}

function getForumLinksFromHtml(html) {
  const links = getLinks(html, '.forums .c_forum a').filter(link => link.url.match(/^.*\/forum\/.*$/));
  debug.log('links found: ', links.map(link => link.text).join());
  return links;
}

async function getThreadLinks(forumUrl) {
  const html = await getUrl(forumUrl);
  const forums = getLinks(html).filter(link => link.url.match(/^.*\/topic\/.*$/));
  // TODO: finish this
}


function getElementText(html, locator) {
  const element = getDocument(html).querySelector(locator);
  return element && element.textContent;
}

function getUsername(html) {
  return getElementText(html, '#top_info strong');
}


function getForumId(forumUrl) {
  const match = forumUrl.match(/forum\/(\d+?)\//);
  return match && match[1] ? match[1] : undefined;
}

async function getForums(forum, visited={}, level='*') {

  visited[getForumId(forum.url)] = forum.url;

  try {
    const html = await getUrl(forum.url);
    console.log(`\n${level}  Walking ${forum.name} as ${getUsername(html)}`);


    const subforumLinks = getForumLinksFromHtml(html);

    // const parentForum = getParentForumFromHtml(html);
    // console.log(`${parentForum} > ${forum.name}`);

    const unvisitedForumLinks = subforumLinks.filter(subforumLink => !EXCLUDED_FORUMS.includes(getForumId(subforumLink.url)) && !visited[getForumId(subforumLink.url)]);

    for (let link of unvisitedForumLinks) {
      var subforum = new Forum(link.text, link.url);
      subforum.subforums = await getForums(subforum, visited, level + '*');

      // console.log(`\n${forum.name} > ${subforum.name}`);
      // console.log('forum.subforums (before): ', forum.subforums);
      // console.log('subforum: ', subforum);
      Object.assign(visited, subforum.subforums.visited);
      forum.subforums[getForumId(subforum.url)] = subforum;
      // console.log('forum.subforums (after): ', forum.subforums);
    }

    visited[getForumId(forum.url)] = forum;
  } catch (e) {
    console.warn(e);
  }
  return forum.subforums;
}


class Forum {
  constructor(name, url, subforums={}) {
    this.name = name;
    this.url = url;
    this.subforums = subforums;    
  }
}

async function getAllForums(forumRoot, name='General Topics') {
  const forums = await getForums(new Forum(name, forumRoot));
  return forums;
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

(async () => {
  const forums = await getAllForums(urls.forums.home);
  console.log(JSON.stringify(forums, null, '\t'));
})();
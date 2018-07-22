const fs = require('fs');
const path = require('path');

const request = require('request-promise-native');
const Cookie = require('tough-cookie'); // request sub-dependency
const jar = request.jar();

const jsdom = require('jsdom').JSDOM;
const encoder = require('js-htmlencode');

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

function uniqueArray(ary, filter=e=>e) {
  return ary.filter((e, index, ary)=>filter(e, index, ary));
}



function formatTime(date) {
  let hours = date.getUTCHours();
  let minutes = date.getUTCMinutes();
  let seconds = date.getUTCSeconds();
  let ms = date.getUTCMilliseconds();

  return `${hours ? hours + 'h ' : ''}${minutes ? minutes + 'm ' : ''}${seconds ? seconds + 's' : ms  + 'ms'}`;
}

// returns the absolute difference between two dates as in H/M/S. assumes difference is less than 24 hours
function timeDifference(timeAsDate1, timeAsDate2) {
  const startTime = timeAsDate1  < timeAsDate2 ? timeAsDate1 : timeAsDate2;
  const endTime = timeAsDate1  < timeAsDate2 ? timeAsDate2 : timeAsDate1;
  var diff = new Date(endTime.getTime() - startTime.getTime());
  return diff;
}

function timeDifferenceReadableString(timeStart, timeEnd) {
  return formatTime(timeDifference(timeStart, timeEnd));
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
  const links = typeof locator === 'function' ? locator(document) : querySelectorAll(document, locator);
  return links.filter(link => !!link.href).map(link => { return {url: link.href, text: link.innerHTML}; });
}

function getParentForumFromHtml(html) {
  const document = getDocument(html);
  return arrayFrom(document.querySelector('#nav').querySelectorAll('li'), 0).filter(el => el.textContent && el.textContent.length > 0 && el.textContent !== ">").slice(-2)[0].textContent;
}

// get the page count from the html of a forum listing page
//  e.g. http://s6.zetaboards.com/EmpireLost/forum/17467/1?cutoff=100&sort_by=DESC&sort_key=last_unix&x=90
//  parses the last entry from the navigation links
//  this count can vary for a given forum based the cutoff value (100 is the max)
async function getForumPageCount(html) {
  const document = getDocument(html);
  try {
    const navLinks = document.querySelector('.cat-pages');
    if (navLinks) {
      return querySelectorAll(navLinks, 'li a').map(link => link.textContent).slice(-1)[0];
    }
  } catch (e) {
    console.log('Error parsing thread count:', e);
  }
  return 1;
}

function getForumLinksFromHtml(html) {
  const links = getLinks(html, '.forums .c_forum a').filter(link => link.url.match(/^.*\/forum\/.*$/));
  debug.log('links found: ', links.map(link => link.text).join());
  return links;
}

async function getThreadsFromHtml(html) {
  const threads = getLinks(html, document => 
    querySelectorAll(document, '.posts td.c_cat-title > a'))
    .filter(link => link.url.match(/^.*\/topic\/.*$/));

  console.log('\nthreads:\n' + threads.map(thread => `${thread.text}: ${thread.url}` ).join('\n'));
  return uniqueArray(threads, (e, index, ary)=>ary.findIndex(el => el.url === e.url) === index).map(thread => ({ name: thread.text, url: thread.url }));
}

async function getRawPost(forumId, threadId, postId) {
  const editPageUrl = `http://s6.zetaboards.com/EmpireLost/post/?mode=3&f=${forumId}&t=${threadId}&p=${postId}`;
  const html = await getUrl(editPageUrl);
  const content = getDocument(html).querySelector('#c_post-wrap textarea').textContent;
  // console.log('Retreived post content:', content);
  return content;
}

async function getPostDataFromHtml(html) {
  const document = getDocument(html);
  return querySelectorAll(document, '#topic_viewer tr[id*="post-"]')
    .map(row => ({ 
      id: row.id.match(/post-(\d+)/)[1], 
      date: row.querySelector('.c_postinfo span.left').textContent.trim(),      
      poster: { 
        id: row.querySelector('.c_username a').href.match(/profile\/(\d+)\//)[1], 
        name: row.querySelector('.c_username').textContent.trim()
      }
    }));
}

async function getPostsFromPageHtml(html, forumId, threadId) {
  const postData = await getPostDataFromHtml(html);
  // console.log('post data:', postData);

  for (post of postData) {
    post.content = await getRawPost(forumId, threadId, post.id);
  }

  console.log('posts:', postData);
  return postData;
}

async function getNextThreadPageLink(html) {
  const document = getDocument(html);
  const pageLinkElement = document.querySelector('.c_next a');
  return pageLinkElement ? pageLinkElement.href : undefined;
}

async function getPosts(forumId, threadId) {
  // TODO: save thread metadata

  const firstPageUrl = `http://s6.zetaboards.com/EmpireLost/topic/${threadId}/1/?${threadQueryParams}`;
 
  let html = await getUrl(firstPageUrl);

  console.log(`First page url: ${firstPageUrl}`);
  const posts = await getPostsFromPageHtml(html, forumId, threadId);
  console.log(`Found ${posts.length} posts`);


  let nextPageUrl = await getNextThreadPageLink(html);
  while (nextPageUrl) {
    console.log(`Scraping next page: ${nextPageUrl}`);    
    html = await getUrl(nextPageUrl);
    const _posts = await getPostsFromPageHtml(html, forumId, threadId);
    console.log(`Found ${_posts.length} posts`);

    posts.push.apply(posts, _posts);
    nextPageUrl = await getNextThreadPageLink(html);
  }
  
  console.log(`Found ${posts.length} total posts`);

  return posts;
}

async function getThreads(forumUrl) {
  // TODO: filter out "moved" threads, e.g. "Music Snob" from http://s6.zetaboards.com/EmpireLost/forum/17467/9?cutoff=1000&sort_by=DESC&x=100

  const firstPageUrl = `${forumUrl}1?${forumQueryParams}`;

  console.log(`Getting list of threads from Page 1 of ${forumUrl}`);
  const html = await getUrl(firstPageUrl);

  const pageCount = await getForumPageCount(html);
  console.log('Number of pages: ' + pageCount);

  const threads = await getThreadsFromHtml(html);

  console.log(`Found ${threads.length} threads`);

  for (let i = 2; i <= pageCount; i++) {
    const _url = `${forumUrl}${i}?${forumQueryParams}`;

    console.log(`Getting list of threads from Page ${i} of ${forumUrl}`);

    const _html = await getUrl(_url);
    const _threads = await getThreadsFromHtml(_html);
    
    console.log(`Found ${_threads.length} threads`);
    threads.push.apply(threads, _threads);
  }

  console.log(`Found ${threads.length} total threads`);

  return threads;
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

    for (link of unvisitedForumLinks) {
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
const threadQueryParams = 'cutoff=1000&sort_by=DESC&x=100'; // for testing
// const threadQueryParams = 'cutoff=1000&sort_by=DESC&x=10'; // to speed testing

const urls = {
  forums: {
    'home': 'http://s6.zetaboards.com/EmpireLost/index/'
  }
};

(async () => {
  // TODO getAllForums return values should include id property (parsed from forum url)
  const forums = await getAllForums(urls.forums.home);
  debug.log(JSON.stringify(forums, null, '\t'));

  const testForumIndex = 9; // 0, 1, 8, 9

  const testForum = Object.values(forums)[testForumIndex];
  console.log('TEST FORUM: ', testForum);
  console.log(`Getting links for ${testForum.name} (${testForum.url})`);
  
  // TODO getThreads return values should include id property (parsed from thread url)
  // TODO: get threads from all forums, save in a table
  const threads = await getThreads(testForum.url);

  const testThread = threads[0];
  const threadId = testThread.url.match(/\/topic\/(\d+)/)[1];
  const forumId = testForum.url.match(/\/forum\/(\d+)/)[1];

  console.log('\nTEST THREAD: ', testThread);  
  console.log(`Scraping thread '${testThread.name}' (${forumId} > ${threadId})`);

  const initialTime = new Date(Date.now());
  await getPosts(forumId, threadId);
  const finalTime = new Date(Date.now());

  console.log('Elapsed time to scrape thread: ' + timeDifferenceReadableString(initialTime, finalTime));
})();
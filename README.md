# Web content scraping and CMS recommendation
This repository contains two important tools for web modernization; Web Content Scrapper and CMS recommendation tool.

**Purpose of the Content Extraction Tool**

This tool is designed to support the migration of website content from one web content management system (CMS) to another in situations where no direct or automated migration path exists between the two platforms.
The primary objective of the tool is to extract structured content from the existing website by programmatically scraping its published pages. The tool is implemented using JavaScript and processes each page of the website to collect predefined content elements.
The extracted content is exported into a CSV file to provide a standardized, portable format that can be easily reviewed, transformed, or imported into the target CMS. In the generated CSV file:

1. Each row represents a single web page.
2. Each column represents a specific content element from that page (for example, banner content, descriptions, video information, or related links).
   
By converting unstructured or semi-structured web content into a structured CSV format, this tool enables content teams and migration workflows to efficiently transfer, validate, and re-ingest content into the new CMS without requiring direct integration between the two systems.

Below are the assumptions made:

Section	        Assumed Selector

Banner wrapper	div.banner

Banner image	  img[src] OR inline background-image

Banner title	  h1 or h2

Banner des	    p

Banner button	  a or button

Main desc      	div.main-description

Video wrapper	  div.article-video

Video heading	  h1,h2,h3

Video URL	      iframe[src], a[href], data-src

Tiles wrapper	  div.related-articles

Tile	          .tile, .card, article, li

Tile heading	  h1–h4

Tile des       	p

Tile link	      a


Below is a practical Node.js approach that:
1.	discovers page URLs (via sitemap.xml or a text file list),
2.	fetches each page HTML,
3.	extracts the sections you described with CSS selectors,
4.	writes one CSV row per page with one column per content field.
I’m using axios + cheerio (fast, simple) and writing CSV with csv-writer.
Usage:
Installation:
mkdir site-migrate-scraper
cd site-migrate-scraper
npm init -y
npm i axios cheerio csv-writer xml2js p-limit

Add script in this directory.

Run script:
node scrape.js --sitemap https://yourdomain.com/sitemap.xml --out content_export.csv
Where sitemap.xml is your site XML, replace this with a text file, each line contains a URL of a page.


**CMS Recommendation & Comparison Tool**

Overview

The CMS Recommendation & Comparison Tool is a structured decision-support framework designed to help organizations objectively evaluate and select the most suitable Content Management System (CMS) based on their specific business, technical, and operational priorities.
Instead of relying on opinions or vendor bias, the tool uses a weighted scoring model that combines:
•	A frozen baseline evaluation of leading CMS platforms, and
•	User-defined importance (impact) for each evaluation parameter.
The output is a ranked list of CMSs, tailored to the user’s needs, along with normalized scores for easy comparison.
________________________________________
Why this tool exists

Choosing a CMS is a long-term architectural and operational decision. Poor choices often lead to:
•	High license and maintenance costs
•	Vendor lock-in
•	Lack of skilled resources
•	Scalability or governance issues
This tool addresses those risks by:
•	Making trade-offs explicit
•	Balancing business, technology, operations, and people factors
•	Providing a transparent and repeatable decision process
________________________________________
CMS coverage

The tool evaluates 25 widely used CMS platforms, covering:
•	Enterprise CMSs (e.g., AEM, Sitecore, Optimizely)
•	Open-source CMSs (e.g., WordPress, Drupal, Umbraco)
•	Headless CMSs (e.g., Contentful, Strapi, Sanity)
•	No-code / SaaS CMSs (e.g., Webflow, Wix, Squarespace)
Each CMS is also tagged with a CMS Type (comma-separated), such as:
•	Enterprise
•	Open Source
•	Headless
•	Hybrid
•	SaaS
•	No-Code
This allows filtering and contextual interpretation of results.



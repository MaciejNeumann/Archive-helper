## Project purpose
We want to build a project, that will help with archiving content in the Dynatrace Community. After uploading CSV file (with community posts), the Archive helper will evaluate if the content in the posts is still up to date, or if it should be archived. The content will be checked against the Dynatrace Documentation and Dynatrace Blog if it is still valid in the currect year, then through the couple of other rules (like if the user is still active in the Community, or if there is any interaction under the post) and scored from 1 to 5 stars - 5 stars meaning that there is high possibility that this should be archived, 1 for low.

## Product features
1. Ability to upload 2 CSV files - one with Community content, second with the user data
2. Then, after pressing a button, the Archive helper will check the content against the Dynatrace Documentation (https://docs.dynatrace.com/docs) and Dynatrace blog (https://www.dynatrace.com/news/blog/). If the content appears outdated, give it higher score for archiving. Do this check in the most efficient matter possible.
3. Then it will check against these rules:
    a. How old is the posts? If it is older than 3 years, this increases the possibility of archiving
    b. Are any comments under the post, and the post is older than a year? If not, this increases the possibility of archiving
    c. Are there any kudos for this post, and the post is older than a year? If not, this increases the possibility of archiving
4. After this check, show the results in the table. The best candidates for archiving should be at the top, the worst one at the bottom
5. If possible, add in the table the reason, why this particular posts is a good candidate for archiving
6. Remember to add link to the post in the table, so it will be easy to check it out
7. Add a column called "checked" with ability to add a checkmark if the post was checked by the real user
8. Give Archive helper ability to save a session and restore it

## Backend
1. Node.js as a basis for everything, rest is up to you

## Style
1. Use dynatrace.com and community.dynatrace.com as insipration for the frontend - similar colors, button, and so on
2. Make it clear and readable, but don't be afraid of colors, fancy animations and a little bit of razzle-dazzle.
3. Do not use typical LLM/CLaude styling, make it similar to the real SaaS products

## Coding Best Practices
    Early Returns: Use to avoid nested conditions
    Descriptive Names: Use clear variable/function names (prefix handlers with "handle")
    Constants Over Functions: Use constants where possible
    DRY Code: Don't repeat yourself
    Functional Style: Prefer functional, immutable approaches when not verbose
    Minimal Changes: Only modify code related to the task at hand
    Function Ordering: Define composing functions before their components
    TODO Comments: Mark issues in existing code with "TODO:" prefix
    Simplicity: Prioritize simplicity and readability over clever solutions
    Build Iteratively Start with minimal functionality and verify it works before adding complexity
    Functional Code: Use functional and stateless approaches where they improve clarity
    Clean logic: Keep core logic clean and push implementation details to the edges
    File Organsiation: Balance file organization with simplicity - use an appropriate number of files for the project scale
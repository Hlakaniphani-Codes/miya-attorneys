# Approved Plan — Main Page (Home) Amendments

## Information Gathered
- `index.html` contains all Home page sections, including:
  - Sticky header + logo + nav links
  - Hero section with a 3-slide background slideshow (`miya3.jpg`, `miya4.jpg`, `law.jpg`)
  - A “Firm Leadership”/Founder message section (currently different content)
  - A “Core Philosophy Cards” section (currently not the requested “Why Clients Choose…” section)
- The file already includes image assets (e.g., `logo.jpeg`, `MRSM.jpeg`).

## Plan
### File: `index.html`
1. Header
   - Reduce logo size (adjust image class from `h-14` to a smaller height).
   - Keep nav labels as requested: `HOME / ABOUT US / PRACTICE AREAS / ATTORNEYS / INSIGHTS / CONTACT US`.
   - Ensure tagline line remains: `Your legal remedy`.
2. Hero section
   - Replace hero headings/subheading/paragraph with the requested marketing copy:
     - `Protecting Rights. Managing Risk. Delivering Results.`
     - Strategic South Africa description.
     - CTA text: `Book a Consultation | Explore Our Services`.
   - Replace background with a single building background image (optionally animated, but only one source).
3. Founder (Page 1 section)
   - Update heading to `A Message from Our Founder`.
   - Ensure photo is present (use existing photo slot; replace image if needed later).
   - Replace founder paragraphs with the exact provided wording.
4. “Why Clients Choose Miya Attorneys?” section
   - Replace the current “Core Philosophy Cards” with a new section titled exactly:
     - `Why Clients Choose Miya Attorneys?`
   - Add 6 items with check icons and the exact labels:
     - Strategic Legal Advice
     - Proactive Risk Management
     - Trusted Partnerships
     - National Footprint
     - Level 1 B-BBEE
     - Public & Private Sector Expertise
5. Dropdown summary mapping
   - Verify the existing hover dropdown JS summaryMap still points correctly after any nav label changes.
6. Sanity check
   - Run a local browser load to confirm no broken DOM/script errors.

## Dependent Files to be edited
- Only `index.html` for the Home-page changes in this iteration.

## Followup steps
- Open the website in browser and visually confirm:
  - Header/nav appearance
  - Hero background behavior
  - Founder section copy + photo
  - New icon list section



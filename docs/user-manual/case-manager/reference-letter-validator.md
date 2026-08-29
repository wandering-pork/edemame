# Reference Letter Validator + Generator

The Reference Letter Validator is a Workspace Tool inside a case. It checks an employment
reference letter against what a skills assessing authority commonly asks for, tells you which
fields look missing, and generates a pre-filled draft letter for the employer to complete.

It supports five assessing authorities:

| Authority | Typically used for |
|---|---|
| ACS (Australian Computer Society) | ICT occupations |
| AITSL | Teaching occupations |
| Engineers Australia | Engineering occupations |
| VETASSESS | General professional, technical and trade occupations |
| ANMAC | Nursing and midwifery |

## Important — what this tool is and is not

Results are **AI-suggested and must be reviewed before use**. The per-authority requirement lists
built into Edamame are a best-effort summary of common expectations, not legal advice, and passing
the check does not guarantee an authority will accept a letter. Always check the authority's
current published guidance. The generated letter is a **draft for the employer to complete and put
on their own letterhead** — it is never a submittable document as it comes out of Edamame.

## Opening the tool

1. Open a case, and stay on the **Workspace** tab.
2. Under **Tools**, click **Reference Letter Validator**.

## Step 1 — Pick the authority and (optionally) upload a letter

1. Choose the assessing authority the letter is going to. A short summary of what that authority
   looks for appears underneath your choice.
2. Drag and drop the existing reference letter, or click to browse. PDF, JPG and PNG files are
   supported — the file is sent to Gemini to be read and is not stored on Edamame's servers.
3. If there is no letter yet, click **No letter yet — go straight to a blank draft** to skip
   straight to the draft, pre-filled from the case.

## Step 2 — Review the extracted fields

Edamame reads the letter and compares what it found against the chosen authority's requirements.

- A banner at the top lists the **missing required fields** and a completeness percentage, plus any
  optional fields worth adding.
- Every field is shown in an editable box, tagged **found**, **missing** or **optional**. The AI can
  misread a letter — correct anything that is wrong, and fill in anything you know that the letter
  didn't state.
- The applicant's name, and the employer's name/address/contact details when the case records an
  employer or sponsor party, are pre-filled from the case.

Click **Generate Draft** when the fields look right.

## Step 3 — Use the draft

The draft letter is shown in full. Anything still unknown appears as a placeholder such as
`[INSERT HOURS WORKED PER WEEK]`. Underneath the letter body is an authority-specific checklist of
points to verify before sending it to the employer.

From here you can:

- **Copy** — copy the draft to the clipboard, e.g. to paste into an email to the employer.
- **Download** — save the draft as a `.txt` file.
- **Add to Case Files** — save the draft into the case's Case Files, tagged with the
  **REFLTR — Employment reference letter** Document Type, so it flows into the Document Checklist's
  auto-link the same way any other case file does.

Use **Back** at any point to return to the review step and change a field — the draft regenerates
from whatever the fields currently say.

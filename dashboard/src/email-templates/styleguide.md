# Empathy Link Email Style Guide

This guide defines the visual standards for transactional and marketing emails sent from the backend. Use these specifications to ensure brand consistency across all user touchpoints.

## 1. Color Palette

Use these colors to maintain the Empathy Link identity. Colors are derived from `baseColors.config.js`.

### Primary Colors
| Name | Hex Code | Usage |
|------|----------|-------|
| **Primary (Forest)** | `#0B4445` | Primary buttons, headings, key accents, greeting text |
| **Accent (Purple)** | `#A366FF` | Links |
| **Black** | `#021212` | Main body text |
| **Background** | `#ECECDE` | Main email body background |
| **White** | `#FFFFFF` | Content card backgrounds |
| **Gray** | `#666666` | Footer text |

### Secondary & Accent Colors
| Name | Hex Code | Usage |
|------|----------|-------|
| **Light Gray** | `#F6F6F0` | Highlight box backgrounds, dividers |
| **Zest** | `#D1F72F` | Highlights, badges, callout backgrounds |
| **Lemonade** | `#E8FF83` | Subtler highlights, secondary backgrounds |
| **Lilac** | `#D6BBFF` | Soft accents, secondary button backgrounds |
| **Rose** | `#F0BADA` | Warm accents |
| **Pink** | `#DB79AA` | Alternative primary accents |
| **Orange** | `#FF9C34` | Warnings, important notices |
| **Brick** | `#C62828` | Error states, critical alerts |
| **Emerald** | `#22A4B4` | Success states, positive indicators |

---

## 2. Typography

Use a clean, modern sans-serif stack for maximum compatibility.

**Font Family Stack:**
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
```

| Element | Size | Weight | Line Height | Color |
|---------|------|--------|-------------|-------|
| **H1** | 24px | Bold (700) | 1.3 | Forest (`#0B4445`) |
| **H2** | 20px | Semi-Bold (600) | 1.3 | Forest (`#0B4445`) |
| **Greeting** | 18px | Semi-Bold (600) | 1.3 | Forest (`#0B4445`) |
| **Body** | 16px | Regular (400) | 1.6 | Black (`#021212`) |
| **Small** | 14px | Regular (400) | 1.5 | Forest (`#0B4445`) |
| **Link** | 16px | Medium (500) | 1.6 | Purple (`#A366FF`) |
| **Footer** | 12px | Regular (400) | 1.5 | Gray (`#666666`) |
| **Highlight** | 14px | Regular (400) | 1.5 | Forest (`#0B4445`) |

---

## 3. Layout Structure

Emails should follow a clean, card-based layout centered on the screen.

- **Container Width:** Max 600px
- **Body Background:** `#ECECDE`
- **Content Background:** `#FFFFFF` (Rounded corners: 12px)
- **Padding:**
  - Desktop: 40px
  - Mobile: 20px
- **Box Shadow:** `0 4px 6px rgba(0,0,0,0.05)`

### Header
- **Logo:** Centered top
- **Dimensions:** 192px x 192px (displayed inline-block, vertical-align middle)
- **Margin:** 20px bottom

### Footer
- **Alignment:** Center
- **Margin:** 20px top
- **Text Color:** `#666666`
- **Content:** Copyright, Unsubscribe link (if applicable)

---

## 4. UI Components

### Buttons
**Primary Button:**
- **Background:** Forest (`#0B4445`)
- **Text:** White (`#FFFFFF`)
- **Border Radius:** 24px (Pill shape)
- **Padding:** 12px 24px
- **Font Weight:** Semi-Bold (600)
- **Text Align:** Center
- **Display:** Inline-block
- **Margin Top:** 20px

### Cards / Callouts
**Highlight Box:**
- **Background:** Light Gray (`#F6F6F0`)
- **Text Color:** Forest (`#0B4445`)
- **Border Radius:** 8px
- **Padding:** 16px
- **Word Break:** `break-all` (for URLs/Tokens)

---

## 5. Frequently Used Assets

When referencing assets in emails, ensure they are hosted on a publicly accessible CDN.

| Asset Type | Description | File Name Reference |
|------------|-------------|---------------------|
| **Logo** | Main app icon | `logo.png` (hosted at `https://fsowkw4soogsgw08c0o8w8ws.clustercluster.de/public/logo.png`) |
| **Illustrations** | Friendly character visuals | `illustration-character.png`, `illustration-hands.png` |
| **Backgrounds** | Textured backgrounds | `Jungle.jpg`, `background-lilac.png` |
| **Icons** | Status indicators | `Flame.png` (Streak), `SparklePill.png` |

---

## 6. HTML Email Template Boilerplate

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Empathy Link</title>
  <style>
    body { margin: 0; padding: 0; background-color: #ECECDE; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #021212; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .button { display: inline-block; background-color: #0B4445; color: #ffffff; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; margin-top: 20px; font-size: 16px; }
    .footer { text-align: center; font-size: 12px; color: #666666; margin-top: 20px; }
    h1 { font-size: 24px; font-weight: 700; line-height: 1.3; color: #0B4445; margin-top: 0; }
    h2 { font-size: 20px; font-weight: 600; line-height: 1.3; color: #0B4445; margin-top: 0; }
    p { font-size: 16px; font-weight: 400; line-height: 1.6; color: #021212; margin-bottom: 1em;}
    a { color: #A366FF; text-decoration: none; font-weight: 500; }
    .small-text { font-size: 14px; font-weight: 400; line-height: 1.5; color: #0B4445; }
    .highlight-box { background-color: #F6F6F0; border-radius: 8px; padding: 16px; word-break: break-all; font-size: 14px; color: #0B4445; }
    .greeting { font-size: 18px; font-weight: 600; line-height: 1.3; color: #0B4445; margin-top: 0; margin-bottom: 1em; }

    /* Responsive styles */
    @media only screen and (max-width: 600px) {
      .container { padding: 10px; }
      .card { padding: 20px; }
      h1 { font-size: 22px; }
      h2 { font-size: 18px; }
      p { font-size: 15px; }
      .button { padding: 10px 20px; font-size: 15px; }
      .greeting { font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div style="width:100%; text-align: center; margin-bottom: 20px;">
      <img src="https://fsowkw4soogsgw08c0o8w8ws.clustercluster.de/public/logo.png" alt="Empathy Link" width="192" height="192" style="display:inline-block;vertical-align: middle;">
    </div>
    
    <div class="card">
      <p class="greeting">Hello ${userName}!</p>
      <p>
        Welcome to Empathy Link. We are excited to have you on board.
      </p>
      
      <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
        <a href="${actionUrl}" class="button">
          Get Started
        </a>
      </div>
      
      <p class="small-text">
        If the button doesn't work, copy this link into your browser:
      </p>
      <div class="highlight-box">
        ${actionUrl}
      </div>
      
      <p class="small-text" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        If you did not request this email, you can simply ignore it.
      </p>
    </div>
    
    <div class="footer">
      <p>&copy; ${year} Empathy Link. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
```

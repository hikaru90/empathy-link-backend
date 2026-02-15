# Empathy Link Email Style Guide

This guide defines the visual standards for transactional and marketing emails sent from the backend. Use these specifications to ensure brand consistency across all user touchpoints.

## 1. Color Palette

Use these colors to maintain the Empathy Link identity. Colors are derived from `baseColors.config.js`.

### Primary Colors
| Name | Hex Code | Usage |
|------|----------|-------|
| **Primary (Purple)** | `#A366FF` | Primary buttons, key accents, links |
| **Forest** | `#0B4445` | Headings, dark backgrounds, footer background |
| **Black** | `#021212` | Main body text |
| **Background** | `#ECECDE` | Main email body background |
| **White** | `#FFFFFF` | Content card backgrounds |

### Secondary & Accent Colors
| Name | Hex Code | Usage |
|------|----------|-------|
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
| **Body** | 16px | Regular (400) | 1.6 | Black (`#021212`) |
| **Small** | 14px | Regular (400) | 1.5 | Forest (`#0B4445`) with opacity |
| **Link** | 16px | Medium (500) | 1.6 | Primary (`#A366FF`) |

---

## 3. Layout Structure

Emails should follow a clean, card-based layout centered on the screen.

- **Container Width:** Max 600px
- **Body Background:** `#ECECDE`
- **Content Background:** `#FFFFFF` (Rounded corners: 12px)
- **Padding:**
  - Desktop: 40px
  - Mobile: 20px

### Header
- **Logo:** Centered top
- **Padding:** 20px top/bottom

### Footer
- **Background:** Transparent or Forest (`#0B4445`)
- **Text Color:** Dark Gray or White (if dark background)
- **Content:** Unsubscribe link, physical address, social links

---

## 4. UI Components

### Buttons
**Primary Button:**
- **Background:** Primary (`#A366FF`)
- **Text:** White (`#FFFFFF`)
- **Border Radius:** 24px (Pill shape)
- **Padding:** 12px 24px
- **Font Weight:** Semi-Bold (600)
- **Text Align:** Center

**Secondary Button:**
- **Background:** White (`#FFFFFF`)
- **Text:** Primary (`#A366FF`)
- **Border:** 1px solid Primary (`#A366FF`)
- **Border Radius:** 24px

### Cards / Callouts
**Highlight Box:**
- **Background:** Lilac (`#D6BBFF`) or Zest (`#D1F72F`) with low opacity (e.g., 20%)
- **Border Radius:** 8px
- **Padding:** 16px

---

## 5. Frequently Used Assets

When referencing assets in emails, ensure they are hosted on a publicly accessible CDN.

| Asset Type | Description | File Name Reference |
|------------|-------------|---------------------|
| **Logo** | Main app icon | `icon.png` / `splash-icon.png` |
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
    body { margin: 0; padding: 0; background-color: #ECECDE; font-family: 'Inter', sans-serif; color: #021212; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .button { display: inline-block; background-color: #A366FF; color: #ffffff; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; margin-top: 20px; }
    .footer { text-align: center; font-size: 12px; color: #666666; margin-top: 20px; }
    h1 { color: #0B4445; margin-top: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="" alt="Empathy Link" width="48" height="48">
    </div>
    
    <div class="card">
      <h1>Hello, {{name}}!</h1>
      <p>Welcome to Empathy Link. We are excited to have you on board.</p>
      
      <a href="{{action_url}}" class="button">Get Started</a>
    </div>
    
    <div class="footer">
      <p>&copy; 2026 Empathy Link. All rights reserved.</p>
      <p><a href="{{unsubscribe_url}}" style="color: #666666;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
```

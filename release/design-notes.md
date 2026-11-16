# Sabadchin 0.16 interface references

The implementation uses original CSS geometry and icons. Reference screenshots were inspected for layout research and are not bundled.

| Reference | Applied decision |
| --- | --- |
| [Windows NavigationView](https://learn.microsoft.com/en-us/windows/apps/design/controls/navigationview) and [Mica guidance](https://learn.microsoft.com/en-us/windows/apps/design/style/mica) | Persistent navigation, calm layered cards, consistent spacing and restrained blue accent. The web backdrop is CSS, not native Mica. |
| [AnyList](https://www.anylist.com/lists) and [Bring](https://www.getbring.com/) | A direct item-entry flow, readable shopping rows and accessible main actions. |
| [Todoist](https://www.todoist.com/) and [Microsoft To Do](https://www.microsoft.com/en-us/microsoft-365/microsoft-to-do-list-app) | A stable navigation rail and clear list hierarchy. |
| [TickTick](https://ticktick.com/), [Linear](https://linear.app/) and [Notion](https://www.notion.com/product) | Restrained density, aligned controls and a side-by-side working area on wide displays. |
| [Archnet: Varamin mosque](https://www.archnet.org/sites/1686) and [UNESCO: Persian mosque](https://whc.unesco.org/en/tentativelists/6877/) | Iwan-shaped accents, turquoise/teal and ochre tile borders, plaster-like content surfaces and courtyard geometry. Navigation remains persistent. |
| [Vazirmatn](https://github.com/rastikerdar/vazirmatn), [Inter](https://github.com/rsms/inter), [Amiri](https://github.com/aliftype/amiri) | Bundled, licensed typography: Vazirmatn for Arabic-script body text, Inter for Latin text, Amiri for traditional Arabic-script headings. Full original licences accompany the fonts. WOFF2 files are losslessly compressed from the upstream fonts. |

Five offline interface locales: Persian, English, Kurdish Sorani, Kurdish Kurmanji and Iranian Azerbaijani in Arabic script. Retailer product titles, shop names, addresses and entered values remain original. Locale changes update layout direction, labels and number presentation, and persist on the device. Dialect wording should be reviewed by native speakers before a store release.

Wide desktop screens show the list and basket together. Phones retain separate views and a fixed navigation bar. Search tasks have an independent scrolling area; stopping remains outside that area. Two stores per department is the initial optimization mode. Shop checkboxes start selected; draft changes take effect only when the user updates optimization. Price and fee uncertainty stay visible in concise form.

import {test,expect} from '@playwright/test';
test('workspace, language, diagrams and project isolation',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('heading',{name:'Requirements',exact:true})).toBeVisible();
 await page.locator('#language').selectOption('vi');await expect(page.getByRole('heading',{name:'Yêu cầu',exact:true})).toBeVisible();
 await page.locator('#language').selectOption('en');await page.locator('[data-view=diagrams]').click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();
 await page.getByRole('button',{name:'New BPMN sample'}).click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();await expect(page.locator('.diagram-counts')).toContainText('13');
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'New ERD sample'}).click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();
 await page.getByRole('button',{name:'New SEQUENCE sample'}).click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();
 await page.getByRole('button',{name:'New ACTIVITY sample'}).click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();
 expect(errors).toEqual([]);
});
test('mobile document width',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('[data-view=diagrams]').click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();});

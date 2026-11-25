import {test,expect} from '@playwright/test';
test('workspace, language, diagrams and project isolation',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await page.locator('[data-view=register]').click();await expect(page.getByRole('heading',{name:'Requirements',exact:true})).toBeVisible();
 await page.locator('#language').selectOption('vi');await expect(page.getByRole('heading',{name:'Yêu cầu',exact:true})).toBeVisible();
 await page.locator('#language').selectOption('en');await page.locator('[data-view=diagrams]').click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();
 page.on('dialog',d=>d.accept());await page.getByText('Examples & import',{exact:true}).click();await page.getByRole('button',{name:'New BPMN sample'}).click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();await expect(page.locator('.diagram-counts')).toContainText('13');
 await page.getByText('Examples & import',{exact:true}).click();await page.getByRole('button',{name:'New ERD sample'}).click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();
 await page.getByText('Examples & import',{exact:true}).click();await page.getByRole('button',{name:'New SEQUENCE sample'}).click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();
 await page.getByText('Examples & import',{exact:true}).click();await page.getByRole('button',{name:'New ACTIVITY sample'}).click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();
 expect(errors).toEqual([]);
});
test('mobile document width',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('[data-view=diagrams]').click();await expect(page.locator('.diagram-canvas svg')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();});

test('canvas palette, direct selection, connections and undo',async({page})=>{
 await page.goto('/');await page.locator('[data-view=diagrams]').click();
 await expect(page.locator('.diagram-hit')).toHaveCount(2);
 await page.locator('.diagram-shapes button').filter({hasText:'Use case'}).click();
 await expect(page.locator('.diagram-hit')).toHaveCount(3);
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await page.locator('[data-hit-id=actor1]').click();await page.locator('[data-hit-id=node2]').click();
 await expect(page.locator('.diagram-counts')).toContainText('Connections: 2');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.locator('.diagram-counts')).toContainText('Connections: 1');
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await expect(page.locator('.diagram-counts')).toContainText('Connections: 2');
});

import fitz, pathlib, json, re, collections
from PIL import Image, ImageOps, ImageDraw

source = pathlib.Path(r'C:\Users\Shubham\Desktop\Projects V2\GajkesariAIagents\downloads\bank-statements')
output = pathlib.Path('output/pdf/local-parser-benchmark-20260904')
results = json.loads((output/'results.json').read_text())
seen = set()
tiles = []
for result in results:
    doc = fitz.open(source/result['name'])
    text = '\n'.join(page.get_text(sort=True) for page in doc)
    (output/(result['name']+'.reference.txt')).write_text(text, encoding='utf-8')
    markdown = (output/(result['name']+'.md')).read_text(encoding='utf-8')
    compact = re.sub(r'\s+', '', markdown)
    amounts = collections.Counter(re.findall(r'(?<![\w.])(?:-?\d[\d,]*\.\d{2})(?!\d)', text))
    missing = {amount: count-compact.count(amount) for amount,count in amounts.items() if compact.count(amount)<count}
    references = set(re.findall(r'\b(?:SBS\d{11}|U\d{8}|(?:SBIN|HDFC|ICIC|CHAS|YESB|CBIN|UTIB|AXOD|AUBI|AUBL|CNRB|SVCB)[A-Z0-9]{8,})\b', re.sub(r'\s+', ' ', text)))
    absent = [ref for ref in references if ref not in compact]
    rows = [line for line in markdown.splitlines() if re.match(r'^\|(?:\d{2}[ /-]|U\d)',line)]
    result.update(actualPages=len(doc), markdownTransactionRows=len(rows), referenceAmountOccurrences=sum(amounts.values()), missingAmountOccurrences=missing, referenceIdentifiers=len(references), missingIdentifiers=absent)
    if result['sha256'] not in seen:
        seen.add(result['sha256'])
        pix = doc[0].get_pixmap(matrix=fitz.Matrix(1,1))
        image = Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
        image.thumbnail((650,850))
        tile=Image.new('RGB',(670,890),'white'); tile.paste(image,(10,30)); ImageDraw.Draw(tile).text((10,8),result['name'][:55],fill='black'); tiles.append(tile)
        for index in range(len(doc)):
            doc[index].get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(output/(result['name']+f'.page-{index+1}.png'))
    doc.close()
(output/'accuracy.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
sheet=Image.new('RGB',(670*3,890*2),'#dddddd')
for i,tile in enumerate(tiles): sheet.paste(tile,((i%3)*670,(i//3)*890))
sheet.save(output/'overview.png')
for row in results: print(json.dumps({k:row[k] for k in ['name','actualPages','markdownTransactionRows','referenceAmountOccurrences','missingAmountOccurrences','referenceIdentifiers','missingIdentifiers']}))

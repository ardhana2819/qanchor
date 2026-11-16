# Third-party data notice

`regions.json` is derived from two datasets by Cahya DSN, both under the MIT License:

* Region codes and names: https://github.com/cahyadsn/wilayah (`db/wilayah.sql`), following Kepmendagri 300.2.2-2430 Tahun 2025. Copyright (c) 2017-2025 Cahya DSN.
* Postal codes per village: https://github.com/cahyadsn/wilayah_kodepos (`db/wilayah_kodepos.sql`). Copyright (c) 2024 Cahya DSN.

The exact commits are recorded in the `source` field of `regions.json`. The file is rebuilt with `scripts/build-regions.mjs`.

## License text (identical for both datasets apart from the copyright line)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

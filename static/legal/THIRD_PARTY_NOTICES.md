# Third-Party Notices / 第三者ライセンス表記

このプロジェクト本体は **MIT License**（`LICENSE` 参照）で配布されます。
一方で、以下の第三者コンポーネント（ライブラリ・辞書）を同梱しており、
それぞれ**元のライセンスの条件が適用され続けます**。各ライセンスが求める
著作権表示・注意書きを以下に再掲します（再配布時はこの表記も一緒に配ってください）。

| コンポーネント                                 | 用途                     | ライセンス           | 全文                      |
| ---------------------------------------------- | ------------------------ | -------------------- | ------------------------- |
| Apache ECharts (`assets/echarts.min.*.js`)     | チャート描画             | Apache License 2.0   | `licenses/Apache-2.0.txt` |
| kuromoji.js (`assets/kuromoji.*.js`)           | 日本語形態素解析         | Apache License 2.0   | `licenses/Apache-2.0.txt` |
| IPADIC 辞書 (`vendor/dict/*.dat.gz`)           | kuromoji の辞書          | NAIST / ICOT（下記） | 本ファイル内              |
| fflate (`assets/fflate.min.*.js`)              | ZIP 解凍/圧縮            | MIT                  | 本ファイル内              |
| ML-Ask 感情辞書 (`assets/emotion_dict.*.json`) | 感情分析（pymlask 由来） | BSD 3-Clause         | 本ファイル内              |

ファイル名の `*` は、ファイルの内容から作るハッシュ値です。

---

## Apache ECharts

The distributed ECharts 6.1.0 files include the upstream
[LICENSE](licenses/echarts-LICENSE.txt), [NOTICE](licenses/echarts-NOTICE.txt)
and [d3 license](licenses/LICENSE-d3).

Copyright © The Apache Software Foundation.
Licensed under the Apache License, Version 2.0. See `licenses/Apache-2.0.txt`.
<https://echarts.apache.org/>

## kuromoji.js

The bundled build and dictionaries match kuromoji 0.1.2.
See the [upstream notice](licenses/kuromoji-NOTICE.md).

Copyright © 2014 Takuya Asano. All Rights Reserved.
Licensed under the Apache License, Version 2.0. See `licenses/Apache-2.0.txt`.
<https://github.com/takuyaa/kuromoji.js>

## IPADIC dictionary（`vendor/dict/` 内のバイナリ辞書、kuromoji 経由で同梱）

This software includes a binary and/or source version of data from
**mecab-ipadic-2.7.0-20070801**.

    Copyright 2000, 2001, 2002, 2003 Nara Institute of Science
    and Technology.  All Rights Reserved.

    Use, reproduction, and distribution of this software is permitted.
    Any copy of this software, whether in its original form or modified,
    must include both the above copyright notice and the following
    paragraphs.

    Nara Institute of Science and Technology (NAIST), the copyright holders,
    disclaims all warranties with regard to this software, including all
    implied warranties of merchantability and fitness, in no event shall
    NAIST be liable for any special, indirect or consequential damages or any
    damages whatsoever resulting from loss of use, data or profits, whether
    in an action of contract, negligence or other tortuous action, arising
    out of or in connection with the use or performance of this software.

    A large portion of the dictionary entries originate from ICOT Free
    Software. The following conditions for ICOT Free Software applies to the
    current dictionary as well.

    Each User may also freely distribute the Program, whether in its original
    form or modified, to any third party or parties, PROVIDED that the
    provisions of Section 3 ("NO WARRANTY") will ALWAYS appear on, or be
    attached to, the Program, which is distributed substantially in the same
    form as set out herein and that such intended distribution, if actually
    made, will neither violate or otherwise contravene any of the laws and
    regulations of the countries having jurisdiction over the User or the
    intended distribution itself.

    NO WARRANTY

    The program was produced on an experimental basis in the course of the
    research and development conducted during the project and is provided to
    users as so produced on an experimental basis. Accordingly, the program
    is provided without any warranty whatsoever, whether express, implied,
    statutory or otherwise. The term "warranty" used herein includes, but is
    not limited to, any warranty of the quality, performance, merchantability
    and fitness for a particular purpose of the program and the nonexistence
    of any infringement or violation of any right of any third party.

    Each user of the program will agree and understand, and be deemed to have
    agreed and understood, that there is no warranty whatsoever for the
    program and, accordingly, the entire risk arising from or otherwise
    connected with the program is assumed by the user.

    Therefore, neither ICOT, the copyright holder, or any other organization
    that participated in or was otherwise related to the development of the
    program and their respective officials, directors, officers and other
    employees shall be held liable for any and all damages, including,
    without limitation, general, special, incidental and consequential
    damages, arising out of or otherwise in connection with the use or
    inability to use the program or any product, material or result produced
    or otherwise obtained by using the program, regardless of whether they
    have been advised of, or otherwise had knowledge of, the possibility of
    such damages at any time during the project or thereafter. Each user will
    be deemed to have agreed to the foregoing by his or her commencement of
    use of the program. The term "use" as used herein includes, but is not
    limited to, the use, modification, copying and distribution of the
    program and the production of secondary products from the program.

## fflate

The distribution includes [the original license for fflate 0.8.3](licenses/fflate-LICENSE.txt).

Copyright © Arjun Barrett. Licensed under the MIT License.
<https://github.com/101arrowz/fflate>

    Permission is hereby granted, free of charge, to any person obtaining a
    copy of this software and associated documentation files (the "Software"),
    to deal in the Software without restriction, including without limitation
    the rights to use, copy, modify, merge, publish, distribute, sublicense,
    and/or sell copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
    OTHER LIABILITY ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE.

## ML-Ask emotion dictionary（`assets/emotion_dict.*.json`）

`assets/emotion_dict.*.json` は **pymlask (ML-Ask)** の感情辞書を、kuromoji で
事前トークン化して再構成した派生物です。

Original: ML-Ask by Michal Ptaszynski.
Python port (pymlask): Copyright © Yukino Ikegami.
Licensed under the BSD 3-Clause License.
<https://github.com/ikegami-yukino/pymlask>

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions are met:

    1. Redistributions of source code must retain the above copyright notice,
       this list of conditions and the following disclaimer.
    2. Redistributions in binary form must reproduce the above copyright
       notice, this list of conditions and the following disclaimer in the
       documentation and/or other materials provided with the distribution.
    3. Neither the name of the copyright holder nor the names of its
       contributors may be used to endorse or promote products derived from
       this software without specific prior written permission.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
    IS" AND ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED. IN NO EVENT
    SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
    INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES ARISING
    IN ANY WAY OUT OF THE USE OF THIS SOFTWARE.

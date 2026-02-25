import os
import json
import requests
from bs4 import BeautifulSoup
from unidecode import unidecode

def get_token():
    token = os.getenv('UTFPRSSO')
    if not token:
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith('UTFPRSSO='):
                        token = line.strip().split('=', 1)[1]
                        break
    return token

def create_id_from_label(label):
    clean = label.split('-')[-1].strip().lower()
    clean = unidecode(clean).replace(' ', '')
    if clean.startswith('eng'):
        clean = clean.replace('eng.', 'eng').replace('engenharia', 'eng')
    return clean

def main():
    token = get_token()
    headers = {'Cookie': f'UTFPRSSO={token}; myFavCards=%5B%5D'}
    session = requests.Session()
    session.headers.update(headers)
    
    url = 'https://sistemas2.utfpr.edu.br/dpls/sistema/aluno01/mplistahorario.inicioAluno'
    r = session.get(url)
    soup = BeautifulSoup(r.text, 'html.parser')
    
    curso_select = soup.find('select', {'name': 'p_curscodnr'})
    if not curso_select:
        print("Dropdown de cursos não encontrado.")
        return
        
    options = curso_select.find_all('option')
    print(f"Encontradas {len(options)-1} opções de cursos.")
    
    courses_data = []
    
    for opt in options:
        val = opt.get('value')
        label = opt.text.strip()
        if not val:
            continue
            
        # Post para obter o frame
        post_data = {
            'p_unidcodnr': '1', # Curitiba
            'p_curscodnr': val
        }
        res = session.post(url, data=post_data)
        
        # Encontrar iframe no html de resposta
        frame_soup = BeautifulSoup(res.text, 'html.parser')
        iframe = frame_soup.find('iframe', id='if_listahorario')
        
        if iframe and 'p_arquivoNomeVc=' in iframe['src']:
            codigo = iframe['src'].split('p_arquivoNomeVc=')[1].split('&')[0]
            cid = create_id_from_label(label)
            clean_label = label.split('-')[-1].strip()
            # Tratamento visual
            if "Eng De Computação" in clean_label: clean_label = "Engenharia de Computação"
            elif "Eng Elétrica" in clean_label: clean_label = "Engenharia Elétrica"
            elif "Sist De Informação" in clean_label: clean_label = "Sistemas de Informação"
            elif "Eng Mecatrônica" in clean_label: clean_label = "Engenharia Mecatrônica"
            elif "Eng Civil" in clean_label: clean_label = "Engenharia Civil"
                
            courses_data.append({
                "id": cid,
                "label": clean_label,
                "utfprCode": codigo
            })
            print(f"[{label}] -> {codigo} (id: {cid})")
        else:
            print(f"Atenção: IFrame não encontrado para o curso {label}.")
            
    print(f"\nTotal cursos extraídos: {len(courses_data)}")
    
    # Save to courses.json
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
    os.makedirs(data_dir, exist_ok=True)
    out_path = os.path.join(data_dir, 'courses.json')
    
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(courses_data, f, ensure_ascii=False, indent=2)
        
    print(f"Salvo em {out_path}.")

if __name__ == '__main__':
    main()

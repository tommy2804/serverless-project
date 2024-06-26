export const createUserTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html charset=UTF-8" />
  <title>Your temporary username & password</title>
</head>
<body style="margin: 0;
            padding: 0;
            box-sizing: border-box;
            display: block;
            width: 100%;
            font-family: Inter, sans-serif;">
    <table style="
            display: block;
            width: 100%;
            margin: 0 auto;
            background-color: #f8fafc;
            justify-content: center;
            align-items: center;
            gap: clamp(1.5rem, 1.3295rem + 0.4545vi, 1.875rem);">
      <thead style="display: block;
                background-image: url('https://manage.tommy.ai/images/grid-background.png');
                background-size: initial;
                background-repeat: no-repeat;
                background-position: center;
                padding: clamp(2rem, 1.7727rem + 0.6061vi, 2.5rem) clamp(3rem, 2.6591rem + 0.9091vi, 3.75rem) clamp(1rem, 0.8864rem + 0.303vi, 1.25rem);">
        <tr class="logo" style="display: block;
                text-align: center;
                position: relative;
                padding-bottom: clamp(0.25rem, 0.2216rem + 0.0758vi, 0.3125rem);
                width: 100%;">
            <td style="display: block; margin: auto;">
              <img class="logo-image" style="
                height: clamp(2.4883rem, 1.8854rem + 1.6077vw, 3.8147rem);
                z-index: 1;" src="https://lh3.googleusercontent.com/d/1wpeH_3sBhhAqWtXkZ9GksV7s_tybKRUK=s220?authuser=0" alt="tommy-logo">
            </td>
        </tr>
        <tr class="title"  style="display: block;
                text-align: center;
                position: relative;
                padding-bottom: clamp(1rem, 0.8864rem + 0.303vi, 1.25rem);
                width: 100%;">
          <td style="display: block; margin: auto;">
            <h1 style="font-size: clamp(1.728rem, 1.4037rem + 0.8647vw, 2.4414rem);
                font-weight: 700;
                color: #101828;
                text-align: center;
                margin: 0;
                z-index: 1;">Your temporary username & password</h1>
          </td>
        </tr>
      </thead>
      <tbody style="display: block;
                padding: 0 clamp(4rem, 3.5455rem + 1.2121vi, 5rem);">
        <tr style="display: grid;
                justify-content: center;
                align-items: center;
                padding-bottom: clamp(2rem, 1.7727rem + 0.6061vi, 2.5rem);
                gap: clamp(0.75rem, 0.6648rem + 0.2273vi, 0.9375rem);">
          <td style="margin: 0;
                width: 100%;
                font-size: clamp(1.2rem, 1.0352rem + 0.4394vw, 1.5625rem);
                font-weight: 400;
                color: #475467;
                text-align: center;">
            <b>Hey</b>, thanks for joining Izme revolution!
          </td>
          <td style="margin: 0;
                font-size: clamp(1.2rem, 1.0352rem + 0.4394vw, 1.5625rem);
                font-weight: 400;
                color: #475467;
                text-align: center;">
            For your initial signing up, here are your temporary credential details:
          </td>
        </tr>
        <tr style="display: block;
              width: max-content;
              margin: auto;
              padding-bottom: clamp(2rem, 1.7727rem + 0.6061vi, 2.5rem);
              min-width: 320px;
              max-width: 600px;">
          <td style="display: block;
                margin: 0 auto clamp(1rem, 0.8864rem + 0.303vi, 1.25rem);
                max-width: 600px;
                min-width: 400px;
                box-shadow: 0 1px 2px 0 #1018280D;
                border: 1px solid #D0D5DD;
                background-color: #ffffff;
                border-radius: clamp(0.5rem, 0.4432rem + 0.1515vi, 0.625rem);
                font-size: clamp(1.2rem, 1.0352rem + 0.4394vw, 1.5625rem);
                font-weight: 400;
                color: #101828;">
            <span style="display: inline-block; padding: clamp(0.75rem, 0.6648rem + 0.2273vi, 0.9375rem) clamp(1rem, 0.8864rem + 0.303vi, 1.25rem); border-right: 1px solid #D0D5DD; min-width: 120px">Username</span>
            <span style="display: inline-block; padding: clamp(0.75rem, 0.6648rem + 0.2273vi, 0.9375rem) clamp(1rem, 0.8864rem + 0.303vi, 1.25rem);">{username}</span>
        </td>
        <td style="display: block;
              max-width: 600px;
              min-width: 400px;
              box-shadow: 0 1px 2px 0 #1018280D;
              border: 1px solid #D0D5DD;
              background-color: #ffffff;
              border-radius: clamp(0.5rem, 0.4432rem + 0.1515vi, 0.625rem);
              font-size: clamp(1.2rem, 1.0352rem + 0.4394vw, 1.5625rem);
              font-weight: 400;
              color: #101828;">
          <span style="display: inline-block; padding: clamp(0.75rem, 0.6648rem + 0.2273vi, 0.9375rem) clamp(1rem, 0.8864rem + 0.303vi, 1.25rem); border-right: 1px solid #D0D5DD; min-width: 120px">Password</span>
          <span style="display: inline-block; padding: clamp(0.75rem, 0.6648rem + 0.2273vi, 0.9375rem) clamp(1rem, 0.8864rem + 0.303vi, 1.25rem);">{####}</span>
        </td>
        </tr>
        <tr style="display: block;
              margin: auto;
              padding-bottom: clamp(2rem, 1.7727rem + 0.6061vi, 2.5rem);
              min-width: 320px;
              max-width: 400px;">
          <td style="display: block;
                margin: auto;
                max-width: max-content">
            <a href="https://manage.tommy.ai/" style="padding: clamp(0.75rem, 0.6648rem + 0.2273vi, 0.9375rem) clamp(1.5rem, 1.3295rem + 0.4545vi, 1.875rem);
                font-size: clamp(1.2rem, 1.0352rem + 0.4394vw, 1.5625rem);
                display: block;
                text-align: center;
                font-weight: 700;
                color: #ffffff;
                background: #E31B54;
                border-radius: clamp(0.5rem, 0.4432rem + 0.1515vi, 0.625rem);
                text-decoration: none;
                transition: background-color 0.3s ease;
                margin: auto;
                gap: clamp(0.75rem, 0.6648rem + 0.2273vi, 0.9375rem);">
              Go to Izme App
              <svg width="21" height="20" viewbox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.66634 10.0013H16.333M16.333 10.0013L10.4997 15.8346M16.333 10.0013L10.4997 4.16797" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          </td>
        </tr>
      </tbody>
      <tfoot style="display: block;
                background: #F2F4F7;
                padding: clamp(1.5rem, 1.3295rem + 0.4545vi, 1.875rem) clamp(4rem, 3.5455rem + 1.2121vi, 5rem) clamp(1rem, 0.7727rem + 0.2061vi, 2.5rem);">
          <tr style="display: block;
              width: max-content;
              margin: auto;
              padding-bottom: clamp(2rem, 1.7727rem + 0.6061vi, 2.5rem);
              min-width: 320px;
              max-width: 600px;">
            <td style="font-size: clamp(0.8333rem, 0.7576rem + 0.202vw, 1rem);
              font-weight: 400;
              color: #7A7D85;
              margin: auto;
              text-align: center;">
              <p style="margin: 0">This email was sent to you by Izme.</p>
              <p style="margin: 0">You are receiving this email because someone invited you to his MEMBER.</p>
            </td>
          </tr>
      </tfoot>
    </table>
</body>
</html>

`;

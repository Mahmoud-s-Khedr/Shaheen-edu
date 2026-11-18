# Planned sales, offers, and rewards features

We will add **bundles and flash sales, student credit, student referrals, first-purchase rewards, and family discounts**. Administrators will control the programs and their settings from the admin side.

## 1. Bundles and flash sales

A bundle is a purchasable offer containing **one or more courses or chapters** for one set price. After an approved purchase, the student receives access to every item included.

A flash sale is a bundle with a short availability period and limited spots. For example, an administrator could offer a single course for 25% less for five days, limited to 10 students.

Administrators will be able to configure:

- Bundle name, description, marketing copy, and cover image.
- Included courses and chapters.
- Bundle price.
- Start and end dates.
- Maximum number of students who can purchase it.
- An optional credit reward.
- Whether the bundle qualifies for the first-purchase reward.
- Availability status, including the ability to pause or end the offer.

Each student can purchase a particular bundle once. An administrator cannot include both a course and a chapter belonging to that course in the same bundle.

Limited spots are allocated on a **first-paid, first-served** basis. Starting checkout or submitting a manual payment does not reserve a spot; a spot is allocated when the payment is approved, provided one is still available.

If a student already owns some of the included content, they still pay the **full bundle price**. The platform will show which items they own so they can decide whether to buy it. The purchase record will preserve the bundle contents and price at the time of purchase.

## 2. Student credit

Each student will have a credit balance they can use toward eligible courses, chapters, and bundles. **EGP 1 credit reduces the amount due by EGP 1.**

Credit can come from:

- A successful student referral.
- The student's first qualifying purchase.
- A bundle or offer that includes a credit reward.
- A manual administrator grant or adjustment.

Students can choose whether to use their available credit at checkout. Credit earned from a purchase becomes available for a **future purchase**, after the order qualifies.

Administrators will control credit eligibility, usage limits, expiration, and manual adjustments. They will also be able to review a history of credit earned, spent, expired, and adjusted. The proposed default is that credit cannot be withdrawn as cash or transferred to another student.

## 3. Student referral program

Eligible students will receive a personal invite code or link to share with friends.

The proposed flow is:

1. A new student joins using an existing student's referral code or link.
2. The invited student makes their first qualifying paid purchase.
3. The referring student receives credit.
4. The invited student can also receive a reward if the administrator enables one.

Administrators will control reward amounts, eligible purchases, minimum payment, program dates, reward limits, and whether the program is active. The platform will prevent self-referrals and allow administrators to review suspicious activity.

The platform already has a partner referral system. Student referrals will be a separate reward program, with existing infrastructure reused where suitable.

## 4. First qualifying purchase reward

A student will receive credit **once**, after their first qualifying purchase. Earlier purchases that did not qualify do not remove the opportunity: the student can still earn the reward on their first later qualifying purchase.

The default rules are:

- Paid courses and chapters qualify unless an administrator excludes them.
- Bundles do not qualify unless an administrator enables them.
- The administrator sets the reward amount and minimum required payment.
- The order must be approved.
- The student must actually pay at least the minimum **after discounts and after any credit they use**.

For example, if the minimum is EGP 200, a student who pays EGP 250 qualifies. A student who pays EGP 150 does not, even if the original course price was higher.

## 5. Family groups and discounts

Administrators will be able to create and approve family groups and link the student accounts belonging to each family. Members of an approved family will receive the configured discount on eligible **individual courses and chapters**.

For example, with a 10% family discount, a course priced at EGP 1,000 would cost an approved family member EGP 900.

Administrators will control the discount percentage, program availability, family approval, membership, and suspension. Family membership will not give one student access to another student's purchases or private information.

For the initial version, the proposed default is that the family discount does **not** apply to bundles.

## 6. Checkout and rewards

The proposed calculation order is:

1. Start with the course, chapter, or bundle price.
2. Apply an eligible price discount.
3. Apply the student credit the student chooses to spend.
4. Collect the remaining payment.
5. After approval, grant access and any earned credit rewards.

This keeps discounts and credit separate: a discount changes the price, while credit helps pay the resulting amount.

## Decisions to finalize before implementation

These points were proposed during the discussion but have not yet been confirmed:

- **Discount combinations:** Whether family discounts can combine with existing coupons or campaigns. The suggested default is one price discount per item, followed by student credit.
- **Referral attribution:** Whether an order can use both a student referral and an existing partner referral. The suggested default is one referral source per purchase.
- **Refunds:** How to reverse earned credit and return spent credit, particularly when the student has already spent a reward.

